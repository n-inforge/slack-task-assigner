const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ Endpoint para Slash Command: abrir modal
app.post("/slack/command", async (req, res) => {
  const trigger_id = req.body.trigger_id;

  // Modal con campos
  const modalView = {
    type: "modal",
    callback_id: "task_modal",
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
        element: {
          type: "plain_text_input",
          action_id: "cliente"
        },
        label: {
          type: "plain_text",
          text: "Cliente"
        }
      },
      {
        type: "input",
        block_id: "proyecto_block",
        element: {
          type: "plain_text_input",
          action_id: "proyecto"
        },
        label: {
          type: "plain_text",
          text: "Proyecto en Jira"
        }
      },
      {
        type: "input",
        block_id: "issue_block",
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "issue"
        },
        label: {
          type: "plain_text",
          text: "Issue en Jira (opcional)"
        }
      },
      {
        type: "input",
        block_id: "descripcion_block",
        element: {
          type: "plain_text_input",
          multiline: true,
          action_id: "descripcion"
        },
        label: {
          type: "plain_text",
          text: "Descripción"
        }
      },
      {
        type: "input",
        block_id: "urgencia_block",
        element: {
          type: "static_select",
          action_id: "urgencia",
          options: [
            {
              text: { type: "plain_text", text: "Baja" },
              value: "Baja"
            },
            {
              text: { type: "plain_text", text: "Media" },
              value: "Media"
            },
            {
              text: { type: "plain_text", text: "Alta" },
              value: "Alta"
            }
          ]
        },
        label: {
          type: "plain_text",
          text: "Urgencia"
        }
      },
      {
        type: "input",
        block_id: "estimado_block",
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "estimado"
        },
        label: {
          type: "plain_text",
          text: "Estimado (opcional)"
        }
      },
      {
        type: "input",
        block_id: "canal_block",
        element: {
          type: "plain_text_input",
          action_id: "canal"
        },
        label: {
          type: "plain_text",
          text: "Canal (ej: #dev-taskboard)"
        }
      }
    ]
  };

  try {
    await axios.post("https://slack.com/api/views.open", {
      trigger_id,
      view: modalView
    }, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    res.send(""); // Slack requiere respuesta vacía
  } catch (error) {
    console.error("Error abriendo modal:", error.message);
    res.status(500).send("Error");
  }
});

// ✅ Endpoint para manejar envío del modal
app.post("/slack/interact", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  if (payload.type === "view_submission" && payload.view.callback_id === "task_modal") {
    const values = payload.view.state.values;

    const cliente = values.cliente_block.cliente.value;
    const proyecto = values.proyecto_block.proyecto.value;
    const issue = values.issue_block.issue.value;
    const descripcion = values.descripcion_block.descripcion.value;
    const urgencia = values.urgencia_block.urgencia.selected_option.value;
    const estimado = values.estimado_block.estimado.value;
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

    try {
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

      res.send({ response_action: "clear" }); // Cierra modal
    } catch (error) {
      console.error("Error publicando en Slack:", error.message);
      res.send({ response_action: "errors", errors: { canal_block: "Error publicando en Slack" } });
    }
  } else if (payload.type === "block_actions") {
    // ✅ Manejo del botón "Me lo asigno"
    const userId = payload.user.id;
    const messageTs = payload.message.ts;
    const channelId = payload.channel.id;

    res.sendStatus(200); // Responder rápido

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
    }).catch(error => console.error("Error actualizando mensaje:", error.message));
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
