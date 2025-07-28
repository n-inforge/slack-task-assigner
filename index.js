const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.status(200).send("Servidor corriendo.");
});

app.get("/post-task", (req, res) => {
  res.send(`
    <form action="/post-task" method="POST">
      <label>Cliente: <input type="text" name="cliente" /></label><br/>
      <label>Proyecto en Jira: <input type="text" name="proyecto" /></label><br/>
      <label>Issue en Jira (opcional): <input type="text" name="issue" /></label><br/>
      <label>Descripción: <textarea name="descripcion"></textarea></label><br/>
      <label>Urgencia: 
        <select name="urgencia">
          <option value="Alta">Alta</option>
          <option value="Media">Media</option>
          <option value="Baja">Baja</option>
        </select>
      </label><br/>
      <label>Estimado (opcional): <input type="text" name="estimado" /></label><br/>
      <button type="submit">Enviar tarea</button>
    </form>
  `);
});

app.post("/post-task", async (req, res) => {
  const { cliente, proyecto, issue, descripcion, urgencia, estimado } = req.body;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🆕 Nueva tarea disponible",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Cliente:* ${cliente}\n*Proyecto en Jira:* ${proyecto}${
          issue ? `\n*Issue en Jira:* ${issue}` : ""
        }\n*Descripción:* ${descripcion}\n*Urgencia:* ${urgencia}${
          estimado ? `\n*Estimado:* ${estimado}` : ""
        }`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Me lo asigno",
            emoji: true,
          },
          style: "primary",
          value: "assign_task",
          action_id: "assign_task",
        },
      ],
    },
  ];

  try {
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      {
        channel: "#dev-taskboard", // <- Asegurate que el bot esté invitado a este canal
        blocks,
        text: "Nueva tarea disponible",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.send("✅ Task publicada en Slack");
  } catch (error) {
    console.error("Error al publicar en Slack:", error.response?.data || error.message);
    res.status(500).send("❌ Error al publicar en Slack");
  }
});

app.post("/slack/interactions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  if (payload.type === "block_actions") {
    const user = payload.user.username || payload.user.name;
    const originalBlocks = payload.message.blocks;

    // Modifica los bloques para reflejar la asignación
    const updatedBlocks = [...originalBlocks];
    updatedBlocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🧑 Asignado a *${user}*`,
        },
      ],
    });

    try {
      await axios.post(
        "https://slack.com/api/chat.update",
        {
          channel: payload.channel.id,
          ts: payload.message.ts,
          blocks: updatedBlocks,
          text: "Tarea asignada",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      res.send(); // responde a Slack dentro de 3 segundos
    } catch (error) {
      console.error("Error al actualizar el mensaje:", error.response?.data || error.message);
      res.status(500).send("Error al asignar tarea");
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

