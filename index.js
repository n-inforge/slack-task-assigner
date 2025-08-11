// ---- index.js (completo) ----
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Middlewares para payloads de Slack
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Utils
const cleanChannel = (raw = "") => raw.trim().replace(/^#/, "");

// Healthcheck
app.get("/", (_req, res) => res.status(200).send("Servidor corriendo."));

// ---------- 1) Slash command: abre el modal ----------
app.post("/slack/commands", async (req, res) => {
  const triggerId = req.body?.trigger_id;
  if (!triggerId) {
    console.error("commands: falta trigger_id");
    return res.status(200).send("No se pudo abrir el formulario.");
  }

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
    await axios.post(
      "https://slack.com/api/views.open",
      { trigger_id: triggerId, view },
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" } }
    );
    return res.status(200).send(); // ACK rápido (evita timeout)
  } catch (err) {
    console.error("commands: error abriendo modal:", err.response?.data || err.message);
    return res.status(200).send("No se pudo abrir el formulario.");
  }
});

// ---------- 2) Interactions: submit del modal + botón "Me lo asigno" ----------
app.post("/slack/interactions", async (req, res) => {
  // 1) Parse seguro
  let payload = {};
  try {
    payload = JSON.parse(req.body?.payload || "{}");
  } catch (e) {
    console.error("interactions: no se pudo parsear payload:", e.message);
  }

  // 2) ACK inmediato (Slack exige <3s)
  res.status(200).send("");

  // 3) Procesamos en background
  setImmediate(async () => {
    try {
      // a) Submit del modal
      if (payload.type === "view_submission" && payload.view?.callback_id === "task_form") {
        const v = payload.view.state?.values || {};
        const user_name = payload.user?.username || payload.user?.name || "alguien";

        const cliente     = v.cliente?.input?.value || "";
        const proyecto    = v.proyecto?.input?.value || "";
        const issue       = v.issue?.input?.value || "";
        const descripcion = v.descripcion?.input?.value || "";
        const urgencia    = v.urgencia?.input?.selected_option?.value || "Media";
        const estimado    = v.estimado?.input?.value || "";
        const canal       = cleanChannel(v.canal?.input?.value || "");

        const fields = [
          `*Cliente:* ${cliente}`,
          `*Proyecto en Jira:* ${proyecto}`,
          issue ? `*Issue en Jira:* ${issue}` : null,
          `*Descripción:* ${descripcion}`,
          `*Urgencia:* ${urgencia}`,
          estimado ? `*Estimado:* ${estimado}` : null
        ].filter(Boolean).join("\n");

        const blocks = [
          { type: "section", text: { type: "mrkdwn", text: `🆕 *Nueva tarea disponible:*\n${fields}` } },
          { type: "actions", elements: [
            { type: "button", text: { type: "plain_text", text: "Me lo asigno" },
              style: "primary", action_id: "assign_task" }
          ] },
          { type: "context", elements: [
            { type: "mrkdwn", text: `Publicado por: *${user_name}*` }
          ] }
        ];

        try {
          await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel: canal, text: "Nueva tarea publicada", blocks },
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" } }
          );
          console.log("interactions: tarea publicada en", canal);
        } catch (err) {
          console.error("interactions: error publicando tarea:", err.response?.data || err.message);
        }
        return;
      }

      // b) Click en “Me lo asigno”
      if (payload.type === "block_actions") {
        const action = payload.actions?.[0];
        if (action?.action_id !== "assign_task") return;

        const assigneeId = payload.user?.id;
        const originalFields = (payload.message?.blocks || [])
          .filter(b => b.type === "section")
          .map(b => b.text?.text || "")
          .join("\n");

        const ctx = (payload.message?.blocks || []).find(b => b.type === "context");
        const posterUsername = ctx?.elements?.[0]?.text?.match(/Publicado por: \*(.+?)\*/)?.[1];

        let posterId = null;
        if (posterUsername) {
          try {
            const usersList = await axios.get("https://slack.com/api/users.list", {
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
            });
            posterId = usersList.data.members.find(u => u.name === posterUsername)?.id || null;
          } catch (e) {
            console.error("interactions: users.list error:", e.response?.data || e.message);
          }
        }

        const summary = `📌 *Resumen de tarea asignada:*\n${originalFields}\n👤 Asignada a: <@${assigneeId}>`;

        // DM al asignado
        try {
          await axios.post(
            "https://slack.com/api/chat.postMessage",
            { channel: assigneeId, text: `✅ Te asignaste esta tarea:\n${summary}` },
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
          );
        } catch (e) {
          console.error("interactions: DM asignado error:", e.response?.data || e.message);
        }

        // DM al publicador (si hay)
        if (posterId) {
          try {
            await axios.post(
              "https://slack.com/api/chat.postMessage",
              { channel: posterId, text: `👋 <@${assigneeId}> se asignó esta tarea que publicaste:\n${summary}` },
              { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
            );
          } catch (e) {
            console.error("interactions: DM publicador error:", e.response?.data || e.message);
          }
        }

        // Actualizar card en canal
        try {
          await axios.post(
            "https://slack.com/api/chat.update",
            {
              channel: payload.channel?.id,
              ts: payload.message?.ts,
              text: "Tarea asignada",
              blocks: [
                { type: "section",
                  text: { type: "mrkdwn", text: `✅ Esta tarea fue asignada a <@${assigneeId}>.` } }
              ]
            },
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
          );
        } catch (e) {
          console.error("interactions: actualizar card error:", e.response?.data || e.message);
        }
        return;
      }
    } catch (err) {
      console.error("interactions: error general:", err);
    }
  });
});

// Arranque
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
});
