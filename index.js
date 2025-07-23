const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Endpoint del Global Shortcut: abrir modal
app.post("/slack/shortcut", async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const triggerId = payload.trigger_id;

  // ✅ Respondemos 200 rápido a Slack
  res.sendStatus(200);

  // ✅ Definir el modal con todos los campos
  const modalView = {
    type: "modal",
    callback_id: "submit_task_modal",
    title: {
      type: "plain_text",
      text: "Nueva Tarea"
    },
    submit: {
      type: "plain_text",
      text: "Publicar"
    },
    close: {
      type: "plain_text",
      text: "Cancelar"
    },
    blocks: [
      {
        type: "input",
        block_id: "cliente_block",
        label: { type: "plain_text", text: "Cliente" },
        element: { type: "plain_text_input", action_id: "cliente" }
      },
      {
        type: "input",
        block_id: "proyecto_block",
        label: { type: "plain_text", text: "Proyecto en Jira" },
        element: { type: "plain_text_input", action_id: "proyecto" }
      },
      {
        type: "input",
        block_id: "issue_block",
        optional: true,
        label: { type: "plain_text", text: "Issue en Jira (opcional)" },
        element: { type: "plain_text_input", action_id: "issue" }
      },
      {
        type: "input",
        block_id: "descripcion_block",
        label: { type: "plain_text", text: "Descripción" },
        element: { type: "plain_text_input", multiline: true, action_id: "descripcion" }
      },
      {
        type: "input",
        block_id: "urgencia_block",
        label: { type: "plain_text", text: "Urgencia" },
        element: {
          type: "static_select",
          action_id: "urgencia",
          options: [
            { text: { type: "plain_text", text: "Baja" }, value: "Baja" },
            { text: { type: "plain_text", text: "Media" }, value: "Media" },
            { text: { type: "plain_text", text: "Alta" }, value: "Alta" }
          ]
        }
      },
      {
        type: "input",
        block_id: "estimado_block",
        optional: true,
        label: { type: "plain_text", text: "Estimado (opcional)" },
        element: { type: "plain_text_input", action_id: "estimado" }
      },
      {
        type: "input",
        block_id: "canal_block",
        label: { type: "plain_text", text: "Canal Slack (ej: #dev-taskboard)" },
        element: { type: "plain_text_input", action_id: "canal" }
      }
    ]
  };

  // ✅ Abrir el modal
  await axios.post("https://slack.com/api/views.open", {
    trigger_id: triggerId,
    view: modalView
  }, {
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
});

// ✅ Recibir el envío del modal
app.post("/slack/interact", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  if (payload.type === "view_submission" && payload.view.callback_id === "submit_task_modal") {
    const values = payload.view.state.values;

    const cliente = values.cliente_block.cliente.value;
    const proyecto = values.proyecto_block.proyecto.value;
    const issue = values.issue_block.issue.value || "";
    const descripcion = values.descripcion_block.descripcion.value;
    const urgencia = values.urgencia_block.urgencia.selected_option.value;
    const estimado = values.estimado_block.estimado.value || "";
    const canal = values.canal_block.canal.value.replace('#', '').trim();

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
            text: { type: "plain_text", text: "Me lo asigno" },
            style: "primary",
            action_id: "assign_task"
          }
        ]
      }
    ];

    // ✅ Publicar la card en el canal
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

    res.send({ response_action: "clear" }); // Cierra el modal
  } else {
    res.sendStatus(200);
  }
});

// ✅ Botón "Me lo asigno"
app.post("/slack/button", (req, res) => {
  const payload = JSON.parse(req.body.payload);
  const userId = payload.user.id;
  const messageTs = payload.message.ts;
  const channelId = payload.channel.id;

  res.sendStatus(200);

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
  });
});

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
