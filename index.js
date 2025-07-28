const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const app = express();

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post("/slack/commands", async (req, res) => {
  const form = {
    response_type: "ephemeral",
    text: "📝 Completá los datos de la tarea:",
    blocks: [
      {
        type: "input",
        block_id: "cliente",
        label: { type: "plain_text", text: "Cliente" },
        element: {
          type: "plain_text_input",
          action_id: "input"
        }
      },
      {
        type: "input",
        block_id: "proyecto",
        label: { type: "plain_text", text: "Proyecto en Jira" },
        element: {
          type: "plain_text_input",
          action_id: "input"
        }
      },
      {
        type: "input",
        block_id: "issue",
        label: { type: "plain_text", text: "Issue en Jira (opcional)" },
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "input"
        }
      },
      {
        type: "input",
        block_id: "descripcion",
        label: { type: "plain_text", text: "Descripción" },
        element: {
          type: "plain_text_input",
          multiline: true,
          action_id: "input"
        }
      },
      {
        type: "input",
        block_id: "urgencia",
        label: { type: "plain_text", text: "Urgencia" },
        element: {
          type: "static_select",
          action_id: "input",
          options: [
            { text: { type: "plain_text", text: "Alta" }, value: "alta" },
            { text: { type: "plain_text", text: "Media" }, value: "media" },
            { text: { type: "plain_text", text: "Baja" }, value: "baja" }
          ]
        }
      },
      {
        type: "input",
        block_id: "estimado",
        label: { type: "plain_text", text: "Estimado (opcional)" },
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "input"
        }
      },
      {
        type: "input",
        block_id: "canal",
        label: { type: "plain_text", text: "Canal donde publicar (#...)" },
        element: {
          type: "plain_text_input",
          action_id: "input"
        }
      }
    ],
    type: "modal",
    callback_id: "task_form"
  };

  res.json({
    response_action: "push",
    view: form
  });
});

app.post("/post-task", async (req, res) => {
  const {
    cliente,
    proyecto,
    issue,
    descripcion,
    urgencia,
    estimado,
    canal,
    user_name
  } = req.body;

  const fields = [
    `*Cliente:* ${cliente}`,
    `*Proyecto en Jira:* ${proyecto}`,
    issue ? `*Issue en Jira:* ${issue}` : null,
    `*Descripción:* ${descripcion}`,
    `*Urgencia:* ${urgencia}`,
    estimado ? `*Estimado:* ${estimado}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `🆕 *Nueva tarea disponible:*\n${fields}` }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Me lo asigno" },
          style: "primary",
          action_id: "assign_task"
        }
      ]
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Publicado por: *${user_name}*`
        }
      ]
    }
  ];

  await axios.post(
    "https://slack.com/api/chat.postMessage",
    {
      channel: canal,
      text: "Nueva tarea publicada",
      blocks
    },
    {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  res.send("✅ Tarea publicada en Slack");
});

app.post("/slack/interactions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  if (payload.type === "block_actions") {
    const action = payload.actions[0];
    const userWhoAssignedId = payload.user.id;
    const userWhoAssigned = payload.user.username;

    if (action.action_id === "assign_task") {
      res.send(); // para evitar timeout

      const originalFields = payload.message.blocks
        .filter((block) => block.type === "section")
        .map((block) => block.text.text)
        .join("\n");

      const contextBlock = payload.message.blocks.find(
        (b) => b.type === "context"
      );
      const posterUsername = contextBlock?.elements[0]?.text?.match(
        /Publicado por: \*(.+?)\*/
      )?.[1];

      let posterId = null;
      try {
        const usersList = await axios.get("https://slack.com/api/users.list", {
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` }
        });

        const userFound = usersList.data.members.find(
          (u) => u.name === posterUsername
        );
        posterId = userFound?.id;
      } catch (err) {
        console.error("Error buscando el ID del que posteó:", err);
      }

      const taskSummary = `📌 *Resumen de tarea asignada:*\n${originalFields}\n👤 Asignada a: <@${userWhoAssignedId}>`;

      await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: userWhoAssignedId,
          text: `✅ Te asignaste esta tarea:\n${taskSummary}`
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`
          }
        }
      );

      if (posterId) {
        await axios.post(
          "https://slack.com/api/chat.postMessage",
          {
            channel: posterId,
            text: `👋 Hola, <@${userWhoAssignedId}> se asignó esta tarea que publicaste:\n${taskSummary}`
          },
          {
            headers: {
              Authorization: `Bearer ${SLACK_BOT_TOKEN}`
            }
          }
        );
      }

      await axios.post(
        "https://slack.com/api/chat.update",
        {
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: "Tarea asignada",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ Esta tarea fue asignada a <@${userWhoAssignedId}>.`
              }
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`
          }
        }
      );
    }
  } else {
    res.sendStatus(200);
  }
});

app.get("/", (req, res) => {
  res.status(200).send("Servidor corriendo.");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
});
