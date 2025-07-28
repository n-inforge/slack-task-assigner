const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const app = express();
const PORT = process.env.PORT || 3000;

dotenv.config();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Comando /taskassign - Abre el modal
app.post("/slack/commands", async (req, res) => {
  const trigger_id = req.body.trigger_id;

  const view = {
    type: "modal",
    callback_id: "task_form",
    title: { type: "plain_text", text: "Nueva Tarea" },
    submit: { type: "plain_text", text: "Publicar" },
    close: { type: "plain_text", text: "Cancelar" },
    blocks: [
      {
        type: "input",
        block_id: "cliente",
        label: { type: "plain_text", text: "Cliente" },
        element: { type: "plain_text_input", action_id: "input" }
      },
      {
        type: "input",
        block_id: "proyecto",
        label: { type: "plain_text", text: "Proyecto en Jira" },
        element: { type: "plain_text_input", action_id: "input" }
      },
      {
        type: "input",
        block_id: "issue",
        label: { type: "plain_text", text: "Issue en Jira (opcional)" },
        optional: true,
        element: { type: "plain_text_input", action_id: "input" }
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
        element: { type: "plain_text_input", action_id: "input" }
      },
      {
        type: "input",
        block_id: "canal",
        label: { type: "plain_text", text: "Canal donde publicar (#...)" },
        element: { type: "plain_text_input", action_id: "input" }
      }
    ]
  };

  try {
    await axios.post("https://slack.com/api/views.open", {
      trigger_id,
      view
    }, {
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    res.status(200).send();
  } catch (error) {
    console.error("Error al abrir modal:", error.response?.data || error);
    res.status(500).send("Error al abrir modal");
  }
});

// Procesamiento al enviar el formulario del modal
app.post("/slack/interactions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);

  if (payload.type === "view_submission") {
    const values = payload.view.state.values;
    const user_name = payload.user.username;

    const cliente = values.cliente.input.value;
    const proyecto = values.proyecto.input.value;
    const issue = values.issue?.input?.value || "";
    const descripcion = values.descripcion.input.value;
    const urgencia = values.urgencia.input.selected_option.value;
    const estimado = values.estimado?.input?.value || "";
    const canal = values.canal.input.value;

    const fields = [
      `*Cliente:* ${cliente}`,
      `*Proyecto en Jira:* ${proyecto}`,
      issue ? `*Issue en Jira:* ${issue}` : null,
      `*Descripción:* ${descripcion}`,
      `*Urgencia:* ${urgencia}`,
      estimado ? `*Estimado:* ${estimado}` : null
    ].filter(Boolean).join("\n");

    const blocks = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `🆕 *Nueva tarea disponible:*
${fields}` }
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

    try {
      await axios.post("https://slack.com/api/chat.postMessage", {
        channel: canal,
        text: "Nueva tarea publicada",
        blocks
      }, {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      console.error("Error al publicar la tarea:", err.response?.data || err);
    }

    return res.send({ response_action: "clear" });
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.status(200).send("Servidor corriendo.");
});

app.listen(PORT, () => {
  console.log(`✅ Servidor activo en puerto ${PORT}`);
});
