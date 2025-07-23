const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Formulario con Bootstrap y campos extra
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Crear Nueva Task</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container mt-5">
        <div class="card shadow-lg p-4">
          <h2 class="text-center mb-4">Crear Nueva Task</h2>
          <form action="/post-task" method="POST">
            
            <div class="mb-3">
              <label class="form-label">Cliente</label>
              <input type="text" class="form-control" name="cliente" required>
            </div>

            <div class="mb-3">
              <label class="form-label">Proyecto en Jira</label>
              <input type="text" class="form-control" name="proyecto" required>
            </div>

            <div class="mb-3">
              <label class="form-label">Issue en Jira (opcional)</label>
              <input type="text" class="form-control" name="issue">
            </div>

            <div class="mb-3">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" name="descripcion" rows="3" required></textarea>
            </div>

            <div class="mb-3">
              <label class="form-label">Urgencia</label>
              <select class="form-select" name="urgencia" required>
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">Estimado (opcional)</label>
              <input type="text" class="form-control" name="estimado" placeholder="Ej: 4h">
            </div>

            <div class="mb-3">
              <label class="form-label">Canal Slack (ej: #dev-taskboard)</label>
              <input type="text" class="form-control" name="canal" required>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-primary btn-lg">Publicar en Slack</button>
            </div>
          </form>
        </div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
});

// ✅ Publicar mensaje en Slack con TODOS los campos
app.post("/post-task", async (req, res) => {
  const { cliente, proyecto, issue, descripcion, urgencia, estimado, canal } = req.body;

  const cleanChannel = canal.replace('#', '').trim();
  const issueText = issue ? `\n*Issue en Jira:* ${issue}` : "";
  const estimadoText = estimado ? `\n*Estimado:* ${estimado}` : "";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🆕 *Nueva tarea disponible*\n*Cliente:* ${cliente}\n*Proyecto en Jira:* ${proyecto}${issueText}\n*Descripción:* ${descripcion}\n*Urgencia:* ${urgencia}${estimadoText}`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Me lo asigno"
          },
          style: "primary",
          action_id: "assign_task"
        }
      ]
    }
  ];

  try {
    const response = await axios.post("https://slack.com/api/chat.postMessage", {
      channel: cleanChannel,
      text: "Nueva tarea disponible",
      blocks
    }, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("Slack API response:", response.data);

    if (response.data.ok) {
      res.send("✅ Task publicada en Slack");
    } else {
      res.send(`❌ Error: ${response.data.error}`);
    }
  } catch (error) {
    console.error("Error enviando mensaje a Slack:", error.message);
    res.status(500).send("❌ Error publicando en Slack");
  }
});

// ✅ Manejar clic del botón (responder rápido para evitar timeout)
app.post("/slack/interact", (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const userId = payload.user.id;
  const messageTs = payload.message.ts;
  const channelId = payload.channel.id;

  res.sendStatus(200); // ✅ Respuesta inmediata a Slack

  const newBlocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Asignado a* <@${userId}>`
      }
    }
  ];

  axios.post("https://slack.com/api/chat.update", {
    channel: channelId,
    ts: messageTs,
    blocks: newBlocks,
    text: "Tarea asignada"
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  }).then(() => {
    console.log(`✅ Tarea asignada a <@${userId}>`);
  }).catch(error => {
    console.error("Error actualizando mensaje:", error.message);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

