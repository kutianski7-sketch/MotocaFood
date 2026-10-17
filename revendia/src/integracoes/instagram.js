// Instagram (API do Instagram com login do Instagram — contas Profissionais/Criador).
// Fluxo: botão "Conectar Instagram" -> autorização -> token de longa duração -> publicação automática.
import { config } from "../config.js";

const GRAPH = "https://graph.instagram.com/v21.0";
export const real = () => Boolean(config.instagram.appId && config.instagram.appSecret);
const redirectUri = () => `${config.baseUrl}/api/integracoes/instagram/callback`;

export function urlAutorizacao(state) {
  const p = new URLSearchParams({
    client_id: config.instagram.appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

export async function trocarCodigo(code) {
  const corpo = new URLSearchParams({
    client_id: config.instagram.appId, client_secret: config.instagram.appSecret,
    grant_type: "authorization_code", redirect_uri: redirectUri(), code,
  });
  const curto = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: corpo }).then((r) => r.json());
  if (!curto.access_token) throw new Error(curto.error_message || "Falha ao conectar o Instagram");
  const longo = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${config.instagram.appSecret}&access_token=${curto.access_token}`).then((r) => r.json());
  const perfil = await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${longo.access_token}`).then((r) => r.json());
  return { token: longo.access_token, expiraEm: Date.now() + (longo.expires_in || 5184000) * 1000, userId: perfil.user_id, usuario: perfil.username };
}

// Renova o token de 60 dias (chamado pelo orquestrador)
export async function renovarToken(cred) {
  const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${cred.token}`).then((x) => x.json());
  return r.access_token ? { ...cred, token: r.access_token, expiraEm: Date.now() + r.expires_in * 1000 } : cred;
}

// Publica uma imagem com legenda. imagemUrl precisa ser pública (JPEG).
export async function publicar(cred, { imagemUrl, legenda }) {
  if (!cred?.token) return { simulado: true, id: `sim_${Date.now()}` };
  const criar = await fetch(`${GRAPH}/${cred.userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imagemUrl, caption: legenda, access_token: cred.token }),
  }).then((r) => r.json());
  if (!criar.id) throw new Error(criar.error?.message || "Instagram recusou a mídia");
  const pub = await fetch(`${GRAPH}/${cred.userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: criar.id, access_token: cred.token }),
  }).then((r) => r.json());
  if (!pub.id) throw new Error(pub.error?.message || "Falha ao publicar");
  return { id: pub.id };
}

export async function metricas(cred, mediaId) {
  if (!cred?.token) return null;
  const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=reach,likes,comments,saved,shares&access_token=${cred.token}`).then((x) => x.json());
  return Object.fromEntries((r.data || []).map((m) => [m.name, m.values?.[0]?.value ?? 0]));
}
