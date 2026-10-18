// Assinatura (PIX/cartão), login por WhatsApp + código e confirmação de ações sensíveis.
import express from "express";
import crypto from "node:crypto";
import { um, inserir, atualizar, exec, registrarEvento } from "../db.js";
import { config } from "../config.js";
import * as pagamentos from "../integracoes/pagamentos.js";
import { enviarCodigo, enviarTexto } from "../integracoes/whatsapp.js";
import { agora, hash, id, normalizaWhatsapp, somaDias } from "../util.js";

export const rotas = express.Router();
const COOKIE = "rv_sessao";

// ---------- Middleware de sessão ----------
export function autenticar(req, res, next) {
  const token = req.cookies?.[COOKIE] || req.get("authorization")?.replace(/^Bearer /, "");
  const s = token && um("SELECT * FROM sessoes WHERE token_hash = ?", hash(token));
  const rev = s && um("SELECT * FROM revendedoras WHERE id = ?", s.revendedora_id);
  if (!rev) return res.status(401).json({ erro: "Faça login com seu WhatsApp" });
  if (!["ativa", "teste"].includes(rev.assinatura_status) || (rev.assinatura_ate && new Date(rev.assinatura_ate) < new Date())) {
    return res.status(402).json({ erro: "Assinatura inativa", renovar: "/assinar" });
  }
  req.rev = rev;
  req.sessao = s;
  next();
}

// Ações que mexem com dinheiro/conta bancária exigem novo código recebido no WhatsApp (válido por 10 min)
export function exigirConfirmacao(req, res, next) {
  const c = req.sessao.confirmado_em;
  if (c && Date.now() - new Date(c).getTime() < 10 * 60000) return next();
  res.status(428).json({ erro: "Confirme com o código enviado no seu WhatsApp", confirmar: true });
}

function cookieSessao(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.producao, maxAge: 90 * 86400000, path: "/" });
}

// ---------- Códigos de verificação ----------
const limites = new Map(); // whatsapp -> [timestamps] (anti-abuso: 5 envios/hora)
async function gerarOtp(whatsapp, finalidade) {
  const agoraMs = Date.now();
  const lista = (limites.get(whatsapp) || []).filter((t) => agoraMs - t < 3600000);
  if (lista.length >= 5) throw Object.assign(new Error("Muitas tentativas. Aguarde alguns minutos."), { status: 429 });
  limites.set(whatsapp, [...lista, agoraMs]);
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  exec(`INSERT INTO otps (whatsapp, codigo_hash, finalidade, expira_em, tentativas) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(whatsapp) DO UPDATE SET codigo_hash = excluded.codigo_hash, finalidade = excluded.finalidade, expira_em = excluded.expira_em, tentativas = 0`,
    whatsapp, hash(`${whatsapp}:${codigo}`), finalidade, new Date(agoraMs + 10 * 60000).toISOString());
  const r = await enviarCodigo(whatsapp, codigo);
  return r.simulado && !config.producao ? codigo : null; // em desenvolvimento devolve o código para testes
}

function validarOtp(whatsapp, codigo, finalidade) {
  const o = um("SELECT * FROM otps WHERE whatsapp = ?", whatsapp);
  if (!o || o.finalidade !== finalidade || new Date(o.expira_em) < new Date()) throw Object.assign(new Error("Código expirado. Peça um novo."), { status: 400 });
  if (o.tentativas >= 5) throw Object.assign(new Error("Muitas tentativas. Peça um novo código."), { status: 429 });
  const esperado = Buffer.from(o.codigo_hash), recebido = Buffer.from(hash(`${whatsapp}:${String(codigo).trim()}`));
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
    exec("UPDATE otps SET tentativas = tentativas + 1 WHERE whatsapp = ?", whatsapp);
    throw Object.assign(new Error("Código incorreto"), { status: 400 });
  }
  exec("DELETE FROM otps WHERE whatsapp = ?", whatsapp);
}

const erro = (res, e) => res.status(e.status || 400).json({ erro: e.message });

rotas.post("/auth/enviar-codigo", async (req, res) => {
  try {
    const whatsapp = normalizaWhatsapp(req.body.whatsapp);
    if (!whatsapp) throw new Error("Número de WhatsApp inválido");
    const rev = um("SELECT * FROM revendedoras WHERE whatsapp = ?", whatsapp);
    if (!rev) return res.status(404).json({ erro: "Não encontramos uma assinatura para este número", assinar: "/assinar" });
    const codigoDev = await gerarOtp(whatsapp, "login");
    res.json({ ok: true, codigoDev });
  } catch (e) { erro(res, e); }
});

rotas.post("/auth/verificar", (req, res) => {
  try {
    const whatsapp = normalizaWhatsapp(req.body.whatsapp);
    validarOtp(whatsapp, req.body.codigo, "login");
    let rev = um("SELECT * FROM revendedoras WHERE whatsapp = ?", whatsapp);
    // Teste grátis: o período de 7 dias começa quando o WhatsApp é confirmado
    if (rev.assinatura_status === "pendente_teste") {
      const ate = somaDias(new Date(), config.diasTeste).toISOString();
      atualizar("revendedoras", rev.id, { assinatura_status: "teste", assinatura_ate: ate });
      registrarEvento(rev.id, "assinatura", `Teste grátis de ${config.diasTeste} dias ativo até ${ate.slice(0, 10)}`);
      rev = um("SELECT * FROM revendedoras WHERE id = ?", rev.id);
    }
    const token = crypto.randomBytes(32).toString("hex");
    inserir("sessoes", { token_hash: hash(token), revendedora_id: rev.id, criado_em: agora() });
    cookieSessao(res, token);
    res.json({ ok: true, novo: !um("SELECT id FROM integracoes WHERE revendedora_id = ?", rev.id) });
  } catch (e) { erro(res, e); }
});

rotas.post("/auth/sair", (req, res) => {
  const t = req.cookies?.[COOKIE];
  if (t) exec("DELETE FROM sessoes WHERE token_hash = ?", hash(t));
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

rotas.post("/auth/confirmar/enviar", autenticar, async (req, res) => {
  try { res.json({ ok: true, codigoDev: await gerarOtp(req.rev.whatsapp, "confirmar") }); } catch (e) { erro(res, e); }
});
rotas.post("/auth/confirmar", autenticar, (req, res) => {
  try {
    validarOtp(req.rev.whatsapp, req.body.codigo, "confirmar");
    exec("UPDATE sessoes SET confirmado_em = ? WHERE token_hash = ?", agora(), req.sessao.token_hash);
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

// Conta de demonstração (somente com DEMO=1)
rotas.get("/auth/demo", (req, res) => res.json({ demo: config.demo }));
rotas.post("/auth/demo", (req, res) => {
  if (!config.demo) return res.status(404).end();
  const rev = um("SELECT * FROM revendedoras WHERE id = 'rev_demo'");
  if (!rev) return res.status(404).json({ erro: "Demo não carregada" });
  const token = crypto.randomBytes(32).toString("hex");
  inserir("sessoes", { token_hash: hash(token), revendedora_id: rev.id, criado_em: agora() });
  cookieSessao(res, token);
  res.json({ ok: true });
});

// ---------- Teste grátis (sem cartão; um por número de WhatsApp) ----------
rotas.post("/teste", async (req, res) => {
  try {
    const whatsapp = normalizaWhatsapp(req.body.whatsapp);
    const nome = String(req.body.nome || "").trim();
    if (!nome || !whatsapp) throw new Error("Informe seu nome e WhatsApp");
    const rev = um("SELECT * FROM revendedoras WHERE whatsapp = ?", whatsapp);
    if (rev && rev.assinatura_status !== "pendente_teste") {
      throw Object.assign(new Error("Este WhatsApp já tem conta na RevendIA. Entre pelo app ou escolha um plano."), { status: 409 });
    }
    if (!rev) inserir("revendedoras", { id: id("rev_"), nome, whatsapp, assinatura_status: "pendente_teste", criado_em: agora() });
    else atualizar("revendedoras", rev.id, { nome });
    res.json({ ok: true, dias: config.diasTeste, codigoDev: await gerarOtp(whatsapp, "login") });
  } catch (e) { erro(res, e); }
});

// ---------- Assinatura ----------
rotas.get("/planos", (req, res) => res.json({ ...config.planos, diasTeste: config.diasTeste }));

rotas.post("/assinatura", async (req, res) => {
  try {
    const { nome, plano = "mensal", metodo = "pix" } = req.body;
    const whatsapp = normalizaWhatsapp(req.body.whatsapp);
    if (!nome?.trim() || !whatsapp) throw new Error("Informe seu nome e WhatsApp");
    if (!config.planos[plano] || !["pix", "cartao"].includes(metodo)) throw new Error("Plano ou forma de pagamento inválidos");
    const p = config.planos[plano];
    const a = inserir("assinaturas", { id: id("as_"), whatsapp, nome: nome.trim(), plano, metodo, valor: p.valor, status: "pendente", criado_em: agora() });
    if (metodo === "pix") {
      const r = await pagamentos.criarPix({ assinaturaId: a.id, valor: p.valor, descricao: p.nome, nome, whatsapp });
      atualizar("assinaturas", a.id, { provedor_id: r.provedorId, pix_copia_cola: r.copiaECola, pix_qr_base64: r.qrBase64 });
    } else {
      const r = await pagamentos.criarLinkCartao({ assinaturaId: a.id, valor: p.valor, descricao: p.nome });
      atualizar("assinaturas", a.id, { provedor_id: r.provedorId, link_cartao: r.link });
    }
    res.json(publicaAssinatura(um("SELECT * FROM assinaturas WHERE id = ?", a.id)));
  } catch (e) { erro(res, e); }
});

const publicaAssinatura = (a) => ({ id: a.id, status: a.status, plano: a.plano, valor: a.valor, metodo: a.metodo, pix: a.pix_copia_cola, qr: a.pix_qr_base64, link: a.link_cartao, demo: config.demo && !pagamentos.real() });

rotas.get("/assinatura/:id", (req, res) => {
  const a = um("SELECT * FROM assinaturas WHERE id = ?", req.params.id);
  a ? res.json(publicaAssinatura(a)) : res.status(404).json({ erro: "Não encontrada" });
});

// Ativa a assinatura e cria a conta da revendedora
export async function ativarAssinatura(assinaturaId) {
  const a = um("SELECT * FROM assinaturas WHERE id = ?", assinaturaId);
  if (!a || a.status === "paga") return;
  const dias = config.planos[a.plano].dias;
  let rev = um("SELECT * FROM revendedoras WHERE whatsapp = ?", a.whatsapp);
  const base = rev?.assinatura_ate && new Date(rev.assinatura_ate) > new Date() ? rev.assinatura_ate : new Date();
  const ate = somaDias(base, dias).toISOString();
  if (!rev) rev = inserir("revendedoras", { id: id("rev_"), nome: a.nome, whatsapp: a.whatsapp, plano: a.plano, assinatura_status: "ativa", assinatura_ate: ate, criado_em: agora() });
  else atualizar("revendedoras", rev.id, { plano: a.plano, assinatura_status: "ativa", assinatura_ate: ate });
  atualizar("assinaturas", a.id, { status: "paga", pago_em: agora(), revendedora_id: rev.id });
  inserir("lancamentos", { revendedora_id: rev.id, tipo: "despesa", categoria: "Plataforma RevendIA", descricao: config.planos[a.plano].nome, valor: a.valor, data: agora().slice(0, 10), status: "realizado" });
  registrarEvento(rev.id, "assinatura", `Assinatura ${a.plano} ativa até ${ate.slice(0, 10)}`);
  await enviarTexto(a.whatsapp, `Bem-vinda à RevendIA, ${a.nome.split(" ")[0]}! 💛 Pagamento confirmado.\nEntre no app e toque em "Deixa com a IA" que eu conecto tudo pra você: ${config.baseUrl}/app/`);
}

rotas.post("/assinatura/:id/simular-pagamento", async (req, res) => {
  if (!config.demo || pagamentos.real()) return res.status(404).end();
  await ativarAssinatura(req.params.id);
  res.json({ ok: true });
});
