// Utilitários: ids, dinheiro, datas no fuso da revendedora, criptografia e Pix (BR Code).
import crypto from "node:crypto";
import { config } from "./config.js";

export const id = (prefixo = "") => prefixo + crypto.randomBytes(8).toString("hex");
export const agora = () => new Date().toISOString();
export const reais = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function somaDias(data, dias) {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

// Data local (YYYY-MM-DD) e hora local no fuso configurado
export function dataLocal(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
export function horaLocal(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: config.fuso, hour: "2-digit", hour12: false }).format(new Date(d)));
}
export function dataBR(d) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: config.fuso, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(d));
}

export function normalizaWhatsapp(numero) {
  let n = String(numero || "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n; // DDD + número
  return n.length >= 12 && n.length <= 13 ? n : null;
}

export const hash = (texto) => crypto.createHmac("sha256", config.segredo).update(String(texto)).digest("hex");

// Credenciais das integrações ficam cifradas (AES-256-GCM) no banco
const chave = crypto.createHash("sha256").update(config.segredo).digest();
export function cifra(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave, iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString("base64")).join(".");
}
export function decifra(texto) {
  if (!texto) return null;
  const [iv, tag, dados] = texto.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", chave, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(dados), d.final()]).toString("utf8"));
}

// ---- Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central) ----
function campo(idCampo, valor) {
  return idCampo + String(valor.length).padStart(2, "0") + valor;
}
function crc16(payload) {
  let crc = 0xffff;
  for (const ch of Buffer.from(payload, "utf8")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .-]/g, "");

export function pixCopiaECola({ chave, nome, cidade, valor, txid = "***", descricao = "" }) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave) + (descricao ? campo("02", semAcento(descricao).slice(0, 40)) : "");
  let p =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor ? campo("54", Number(valor).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", semAcento(nome).slice(0, 25) || "RECEBEDOR") +
    campo("60", semAcento(cidade).slice(0, 15) || "BRASIL") +
    campo("62", campo("05", semAcento(txid).replace(/ /g, "").slice(0, 25) || "***")) +
    "6304";
  return p + crc16(p);
}
