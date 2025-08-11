// ---------- 2) Interactions: submit del modal + botón "Me lo asigno" ----------
app.post("/slack/interactions", async (req, res) => {
  // 1) Parse seguro (evita que JSON.parse tire excepción)
  let payload = {};
  try {
    payload = JSON.parse(req.body?.payload || "{}");
  } catch (e) {
    console.error("No se pudo parsear payload:", e);
  }

  // 2) Acknowledge INMEDIATO para no timeoutear el modal
  //    (Slack requiere 200 en < 3s)
  res.status(200).send("");

  // 3) Procesamos en segundo plano
  setImmediate(async () => {
    try {
      // a) Envío del formulario (modal)
      if (payload.type === "view_submission" && payload.view?.callback_id === "task_form") {
        const v = payload.view.state?.values || {};
        const user_name = payload.user?.username || payload.user?.name || "alguien";

        const cliente    = v.cliente?.input?.value || "";
        const proyecto   = v.proyecto?.input?.value || "";
        const issue      = v.issue?.input?.value || "";
        const descripcion= v.descripcion?.input?.value || "";
        const urgencia   = v.urgencia?.input?.selected_option?.value || "Media";  // por si no eligen
        const estimado   = v.estimado?.input?.value || "";
        // canal: aceptamos "#canal" o "canal"
        const canalRaw   = v.canal?.input?.value || "";
        const canal      = (canalRaw || "").trim().replace(/^#/, "");

        // Construye blocks
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
          await axios.post("https://slack.com/api/chat.postMessage",
            { channel: canal, text: "Nueva tarea publicada", blocks },
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" } }
          );
        } catch (err) {
          console.error("Error publicando la tarea:", err.response?.data || err.message);
        }
        return;
      }

      // b) Click en botón "Me lo asigno"
      if (payload.type === "block_actions") {
        const action = payload.actions?.[0];
        if (action?.action_id !== "assign_task") return;

        const assigneeId = payload.user?.id;

        // Texto de la card original
        const originalFields = (payload.message?.blocks || [])
          .filter(b => b.type === "section")
          .map(b => b.text?.text || "")
          .join("\n");

        // Publicador
        const ctx = (payload.message?.blocks || []).find(b => b.type === "context");
        const posterUsername = ctx?.elements?.[0]?.text?.match(/Publicado por: \*(.+?)\*/)?.[1];

        // Intentamos obtener el ID del publicador
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
        try {
          await axios.post("https://slack.com/api/chat.postMessage",
            { channel: assigneeId, text: `✅ Te asignaste esta tarea:\n${summary}` },
            { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
          );
        } catch (e) {
          console.error("DM a asignado error:", e.response?.data || e.message);
        }

        // DM al publicador (si lo encontramos)
        if (posterId) {
          try {
            await axios.post("https://slack.com/api/chat.postMessage",
              { channel: posterId, text: `👋 <@${assigneeId}> se asignó esta tarea que publicaste:\n${summary}` },
              { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
            );
          } catch (e) {
            console.error("DM a publicador error:", e.response?.data || e.message);
          }
        }

        // Actualiza el mensaje del canal
        try {
          await axios.post("https://slack.com/api/chat.update",
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
          console.error("Actualizar mensaje canal error:", e.response?.data || e.message);
        }
        return;
      }
    } catch (err) {
      console.error("Error en /slack/interactions:", err);
    }
  });
});
