const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Util: limpia "#canal" o menciones y deja solo el nombre/id
const cleanChannel = (raw) => (raw || "").trim().replace(/^[#@]/, "");

// ---------- 1) Slash command: abre el modal ----------
app.post("/slack/commands", async (req, res) => {
  const triggerId = req.body.trigger_id;

  const view = {
    type: "modal",
    callback_id: "task_form",
    title: { type: "plain_text", text: "Nueva Tarea" },
    submit: { type: "plain_text", text: "Publicar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      { type: "input", block_id: "cliente",
        label: { type: "plain_text", text: "Cliente" },
        element: { type: "plain_text_input", action_id: "input" } },
      { type: "input", block_id: "proyecto",
        label: { type: "plain_text", text: "Proyecto en Jira" },
        element: { type: "plain_text_input", action_id: "input" } },
      { type: "input", block_id: "issue", optional: true,
        label: { type: "plain_text", text: "Issue en Jira (opcional)" },
        element: { type: "plain_text_input", action_id: "input" } },
      { type: "input", block_id: "descripcion",
        label: { type: "plain_text", text: "Descripción" },
        element: { type: "plain_text_input", multiline: true, action_id: "input" } },
      { type: "input", block_id: "urgencia",
        label: { type: "plain_text", text: "Urgencia" },
        element: { type: "static_select", action_id: "input",
          options: [
            { text: { type: "plain_text", text: "Alta" }, value: "Alta" },
            { text: { type: "plain_text", text: "Media" }, value: "Media" },
            { text: { type: "plain_text", text: "Baja" }, value: "Baja" }
          ] } },
      { type: "input", block_id: "estimado", optional: true,
        label: { type: "plain_text", text: "Estimado (opcional)" },
        element: { type: "plain_text_input", action_id: "input" } },
      { type: "input", block_id: "canal",
        label: { type: "plain_text", text: "Canal donde publicar (#...)" },
        element: { type: "plain_text_input", action_id: "input" } }
    ]
  };

  try {
    await axios.post("https://slack.com/api/views.open",
      { trigger_id: triggerId, view },
      { headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json"
        } }
    );
    res.status(200).send(); // responder rápido para evitar timeout
  } catch (err) {
    console.error("Error abriendo modal:", err.response?.data || err.message);
    res.status(200).send("No se pudo abrir el formulario.");
  }
});

// ---------- 2) Interactions: submit del modal + botón "Me lo asigno" ----------
app.post("/slack/interactions", async (req, res) => {
  const payload = JSON.parse(req.body.payload || "{}");

  // a) Envío del formulario (modal)
  if (payload.type === "view_submission" && payload.view?.callback_id === "task_form") {
    res.status(200).json({ response_action: "clear" }); // cerrar modal

    try {
      const v = payload.view.state.values;
      const user_name = payload.user?.username || payload.user?.name || "alguien";
      const data = {
        cliente: v.cliente.input.value,
        proyecto: v.proyecto.input.value,
        issue: v.issue?.input?.value || "",
        descripcion: v.descripcion.input.value,
        urgencia: v.urgencia.input.selected_option.value,
        estimado: v.estimado?.input?.value || "",
        canal: cleanChannel(v.canal.input.value),
        user_name
      };

      // Construye blocks
      const fields = [
        `*Cliente:* ${data.cliente}`,
        `*Proyecto en Jira:* ${data.proyecto}`,
        data.issue ? `*Issue en Jira:* ${data.issue}` : null,
        `*Descripción:* ${data.descripcion}`,
        `*Urgencia:* ${data.urgencia}`,
        data.estimado ? `*Estimado:* ${data.estimado}` : null
      ].filter(Boolean).join("\n");

      const blocks = [
        { type: "section", text: { type: "mrkdwn", text: `🆕 *Nueva tarea disponible:*\n${fields}` } },
        { type: "actions", elements: [
            { type: "button", text: { type: "plain_text", text: "Me lo asigno" },
              style: "primary", action_id: "assign_task" }
          ] },
        { type: "context", elements: [
            { type: "mrkdwn", text: `Publicado por: *${data.user_name}*` }
          ] }
      ];

      await axios.post("https://slack.com/api/chat.postMessage",
        { channel: data.canal, text: "Nueva tarea publicada", blocks },
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" } }
      );
    } catch (err) {
      console.error("Error publicando la tarea:", err.response?.data || err.message);
    }
    return;
  }

  // b) Click en botón "Me lo asigno"
  if (payload.type === "block_actions") {
    res.status(200).send(); // evitar timeout

    try {
      const action = payload.actions?.[0];
      if (action?.action_id !== "assign_task") return;

      const assigneeId = payload.user.id;

      // Texto de la card original
      const originalFields = payload.message.blocks
        .filter(b => b.type === "section")
        .map(b => b.text.text)
        .join("\n");

      // Publicador
      const ctx = payload.message.blocks.find(b => b.type === "context");
      const posterUsername = ctx?.elements?.[0]?.text?.match(/Publicado por: \*(.+?)\*/)?.[1];

      // Intenta obtener user ID del publicador
      let posterId = null;
      if (posterUsername) {
        try {
          const usersList = await axios.get("https://slack.com/api/users.list", {
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
          });
          posterId = usersList.data.members.find(u => u.name === posterUsername)?.id || null;
        } catch (e) {
          console.error("users.list error:", e.response?.data || e.message);
        }
      }

      const summary = `📌 *Resumen de tarea asignada:*\n${originalFields}\n👤 Asignada a: <@${assigneeId}>`;

      // DM al que se la asignó
      await axios.post("https://slack.com/api/chat.postMessage",
        { channel: assigneeId, text: `✅ Te asignaste esta tarea:\n${summary}` },
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
      );

      // DM al que publicó (si lo encontramos)
      if (posterId) {
        await axios.post("https://slack.com/api/chat.postMessage",
          { channel: posterId, text: `👋 <@${assigneeId}> se asignó esta tarea que publicaste:\n${summary}` },
          { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
        );
      }

      // Actualiza el mensaje del canal
      await axios.post("https://slack.com/api/chat.update",
        {
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: "Tarea asignada",
          blocks: [
            { type: "section",
              text: { type: "mrkdwn", text: `✅ Esta tarea fue asignada a <@${assigneeId}>.` } }
          ]
        },
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
      );
    } catch (err) {
      console.error("Error en asignación:", err.response?.data || err.message);
    }
    return;
  }

  // fallback
  res.sendStatus(200);
});

// ---------- 3) Health check ----------
app.get("/", (_req, res) => res.status(200).send("Servidor corriendo."));

app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
});
