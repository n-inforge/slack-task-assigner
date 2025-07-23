const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Ruta con formulario
app.get("/", (req, res) => {
  res.send(`
    <h1>Crear Nueva Task</h1>
    <form action="/post-task" method="POST">
      <label>Cliente:</label><br>
      <input type="text" name="cliente"><br><br>

      <label>Proyecto en Jira:</label><br>
      <input type="text" name="proyecto"><br><br>

      <label>Descripción:</label><br>
      <textarea name="descripcion"></textarea><br><br>

      <label>Urgencia:</label><br>
      <select name="urgencia">
        <option value="Baja">Baja</option>
        <option value="Media">Media</option>
        <option value="Alta">Alta</option>
      </select><br><br>

      <label>Canal (ej: #dev-taskboard):</label><br>
      <input type="text" name="canal"><br><br>

      <button type="submit">Publicar en Slack</button>
    </form>
  `);
});

// ✅ Publicar mensaje con botón
app.post("/post-task", async (req, res) => {
  const { cliente, proyecto, descripcion, urgencia, canal } = req.body;

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

  await axios.post("https://slack.com/api/chat.postMessage", {
    channel: canal,
    text: "Nueva tarea disponible",
    blocks
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  res.send("✅ Task publicada en Slack");
});

// ✅ Manejar clic del botón
app.post("/slack/interact", async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const userId = payload.user.id;
  const messageTs = payload.message.ts;
  const channelId = payload.channel.id;

  const newBlocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Asignado a* <@${userId}>`
      }
    }
  ];

  await axios.post("https://slack.com/api/chat.update", {
    channel: channelId,
    ts: messageTs,
    blocks: newBlocks,
    text: "Tarea asignada"
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
