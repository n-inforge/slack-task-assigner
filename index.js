const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Ruta con formulario web
app.get("/", (req, res) => {
  res.send(`
    <h1>Crear Nueva Task</h1>
    <form action="/post-task" method="POST">
      <label>Cliente:</label><br>
      <input type="text" name="cliente" required><br><br>

      <label>Proyecto en Jira:</label><br>
      <input type="text" name="proyecto" required><br><br>

      <label>Descripción:</label><br>
      <textarea name="descripcion" required></textarea><br><br>

      <label>Urgencia:</label><br>
      <select name="urgencia">
        <option value="Baja">Baja</option>
        <option value="Media">Media</option>
        <option value="Alta">Alta</option>
      </select><br><br>

      <label>Canal (ej: #dev-taskboard):</label><br>
      <input type="text" name="canal" required><br><br>

      <button type="submit">Publicar en Slack</button>
    </form>
  `);
});

// ✅ Publicar mensaje con botón en Slack
app.post("/post-task", async (req, res) => {
  const { cliente, proyecto, descripcion, urgencia, canal } = req.body;

  // Eliminamos el "#" si lo ponen
  const cleanChannel = canal.replace('#', '').trim();

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🆕 *Nueva tarea disponible*\n*Cliente:* ${cliente}\n*Proyecto:* ${proyecto}\n*Descripción:* ${descripcion}\n*Urgencia:* ${urgencia}`
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

    console.log("Slack API response:", response.data); // ✅ Log para debug

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

// ✅ Manejar clic del botón (responder rápido para evitar error)
app.post("/slack/interact", (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const userId = payload.user.id;
  const messageTs = payload.message.ts;
  const channelId = payload.channel.id;

  // ✅ Responder a Slack inmediatamente para evitar timeout
  res.sendStatus(200);

  // ✅ Actualizamos mensaje en segundo plano
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
