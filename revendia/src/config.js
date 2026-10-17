// Configuração central — tudo vem de variáveis de ambiente (veja .env.example).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Carrega .env simples (sem dependência externa)
const envFile = path.join(RAIZ, ".env");
if (fs.existsSync(envFile)) {
  for (const linha of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const e = process.env;
export const config = {
  porta: Number(e.PORT || 3000),
  baseUrl: (e.BASE_URL || `http://localhost:${e.PORT || 3000}`).replace(/\/$/, ""),
  segredo: e.APP_SECRET || "dev-secret-nao-use-em-producao",
  fuso: e.TZ_REVENDA || "America/Sao_Paulo",
  demo: e.DEMO !== "0",
  producao: e.NODE_ENV === "production",
  dbPath: e.DB_PATH || path.join(RAIZ, "data", "revendia.db"),

  claude: { chave: e.ANTHROPIC_API_KEY || e.ANTHROPIC_AUTH_TOKEN || "", modelo: e.CLAUDE_MODEL || "claude-opus-5-5" },

  planos: {
    mensal: { nome: "RevendIA Mensal", valor: Number(e.PRECO_MENSAL || 79.9), dias: 30 },
    anual: { nome: "RevendIA Anual", valor: Number(e.PRECO_ANUAL || 799), dias: 365 },
  },
  diasTeste: 7,
  mercadoPago: { token: e.MERCADOPAGO_ACCESS_TOKEN || "" },

  whatsapp: {
    token: e.WHATSAPP_TOKEN || "",
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID || "",
    verifyToken: e.WHATSAPP_VERIFY_TOKEN || "revendia-webhook",
    templateOtp: e.WHATSAPP_TEMPLATE_OTP || "codigo_verificacao",
    appId: e.META_APP_ID || "",
    appSecret: e.META_APP_SECRET || "",
    embeddedSignupConfigId: e.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "",
    graph: "https://graph.facebook.com/v21.0",
  },
  instagram: { appId: e.INSTAGRAM_APP_ID || "", appSecret: e.INSTAGRAM_APP_SECRET || "" },
  lalamove: {
    chave: e.LALAMOVE_API_KEY || "",
    segredo: e.LALAMOVE_API_SECRET || "",
    mercado: e.LALAMOVE_MARKET || "BR",
    baseUrl: e.LALAMOVE_BASE_URL || "https://rest.sandbox.lalamove.com",
  },
};
