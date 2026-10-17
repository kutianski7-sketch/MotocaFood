// Webhooks: WhatsApp (Meta) e Mercado Pago.
import express from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { webhookWhatsapp } from "../orquestrador.js";
import * as pagamentos from "../integracoes/pagamentos.js";
import { ativarAssinatura } from "./auth.js";

export const rotas = express.Router();

rotas.get("/whatsapp", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.whatsapp.verifyToken) return res.send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

rotas.post("/whatsapp", (req, res) => {
  // Valida a assinatura da Meta quando o app secret estiver configurado
  if (config.whatsapp.appSecret) {
    const esperado = "sha256=" + crypto.createHmac("sha256", config.whatsapp.appSecret).update(req.rawBody || "").digest("hex");
    const recebido = req.get("x-hub-signature-256") || "";
    if (esperado.length !== recebido.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))) return res.sendStatus(401);
  }
  res.sendStatus(200); // responde rápido; processa em seguida
  webhookWhatsapp(req.body).catch((e) => console.error("[webhook whatsapp]", e));
});

rotas.post("/mercadopago", async (req, res) => {
  res.sendStatus(200);
  try {
    const pagamentoId = req.body?.data?.id || req.query["data.id"] || req.query.id;
    if (!pagamentoId || !pagamentos.real() || (req.body?.type && req.body.type !== "payment")) return;
    const r = await pagamentos.consultarPagamento(pagamentoId); // nunca confia no corpo do webhook: consulta a API
    if (r.aprovado && r.assinaturaId) await ativarAssinatura(r.assinaturaId);
  } catch (e) {
    console.error("[webhook mercadopago]", e.message);
  }
});
