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

// Comando /taskassign
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
            { text: { type: "plain_text", text: "Alta" }, value_
