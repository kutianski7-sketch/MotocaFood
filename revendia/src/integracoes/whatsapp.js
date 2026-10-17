// WhatsApp Business Platform (Cloud API).
// - Número oficial da RevendIA: envia códigos de verificação, lista diária de boletos e avisos à revendedora.
// - Número da revendedora (conectado via Cadastro Incorporado da Meta): recebe pedidos dos clientes
//   e envia avisos/campanhas aos clientes em nome dela.
// Sem token configurado (modo demo), as mensagens são apenas registradas no histórico.
import { config } from "../config.js";
import { inserir, um } from "../db.js";
import { agora, decifra } from "../util.js";

const real = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

async function graph(caminho, corpo, token) {
  const r = await fetch(`${config.whatsapp.graph}/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(`WhatsApp: ${dados?.error?.message || r.status}`);
  return dados;
}

// Credenciais do número da revendedora (se ela conectou o WhatsApp Business dela)
function remetente(revendedoraId) {
  if (revendedoraId) {
    const integ = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'whatsapp' AND status = 'conectado'", revendedoraId);
    const cred = integ && decifra(integ.credenciais);
    if (cred?.token && cred?.phoneNumberId) return cred;
  }
  return real() ? { token: config.whatsapp.token, phoneNumberId: config.whatsapp.phoneNumberId } : null;
}

function registrar(revendedoraId, contato, texto, direcao = "saida") {
  inserir("mensagens", { revendedora_id: revendedoraId || null, direcao, contato, texto, criado_em: agora() });
}

// Mensagem de texto livre (dentro da janela de 24h de atendimento)
export async function enviarTexto(para, texto, { revendedoraId = null, emNomeDaRevendedora = false } = {}) {
  registrar(revendedoraId, para, texto);
  const cred = emNomeDaRevendedora ? remetente(revendedoraId) : real() ? { token: config.whatsapp.token, phoneNumberId: config.whatsapp.phoneNumberId } : null;
  if (!cred) return { simulado: true };
  return graph(`${cred.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: para,
    type: "text",
    text: { body: texto, preview_url: true },
  }, cred.token);
}

// Mensagem de modelo aprovado (fora da janela de 24h — campanhas, avisos proativos)
export async function enviarModelo(para, nomeModelo, parametros = [], { revendedoraId = null, emNomeDaRevendedora = false, textoLog } = {}) {
  registrar(revendedoraId, para, textoLog || `[modelo ${nomeModelo}] ${parametros.join(" | ")}`);
  const cred = emNomeDaRevendedora ? remetente(revendedoraId) : real() ? { token: config.whatsapp.token, phoneNumberId: config.whatsapp.phoneNumberId } : null;
  if (!cred) return { simulado: true };
  return graph(`${cred.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: para,
    type: "template",
    template: {
      name: nomeModelo,
      language: { code: "pt_BR" },
      components: parametros.length ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: String(t) })) }] : [],
    },
  }, cred.token);
}

// Código de verificação (modelo de autenticação com botão "copiar código")
export async function enviarCodigo(para, codigo) {
  registrar(null, para, `Seu código RevendIA: ${codigo}`);
  if (!real()) return { simulado: true };
  return graph(`${config.whatsapp.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: para,
    type: "template",
    template: {
      name: config.whatsapp.templateOtp,
      language: { code: "pt_BR" },
      components: [
        { type: "body", parameters: [{ type: "text", text: codigo }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: codigo }] },
      ],
    },
  }, config.whatsapp.token);
}

// Baixa mídia recebida (áudio, foto de comprovante) para a IA analisar
export async function baixarMidia(mediaId, token = config.whatsapp.token) {
  const info = await fetch(`${config.whatsapp.graph}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  const arq = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  return { mime: info.mime_type, base64: Buffer.from(await arq.arrayBuffer()).toString("base64") };
}

// Cadastro Incorporado: troca o "code" do popup da Meta por um token do número da revendedora
export async function concluirCadastroIncorporado(code) {
  if (!config.whatsapp.appId || !config.whatsapp.appSecret) throw new Error("META_APP_ID/META_APP_SECRET não configurados");
  const url = `${config.whatsapp.graph}/oauth/access_token?client_id=${config.whatsapp.appId}&client_secret=${config.whatsapp.appSecret}&code=${encodeURIComponent(code)}`;
  const r = await fetch(url).then((x) => x.json());
  if (!r.access_token) throw new Error("Não foi possível concluir a conexão do WhatsApp");
  return r.access_token;
}
