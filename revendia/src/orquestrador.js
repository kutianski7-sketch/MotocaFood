// Orquestrador: recebe as mensagens do WhatsApp e roda as rotinas automáticas de todos os agentes.
import { db, um, todos, inserir, atualizar, configDe, registrarEvento } from "./db.js";
import { conector } from "./integracoes/fornecedores/index.js";
import * as motoboy from "./integracoes/motoboy.js";
import * as instagram from "./integracoes/instagram.js";
import { enviarTexto, baixarMidia } from "./integracoes/whatsapp.js";
import { triar } from "./ai/triagem.js";
import { lerComprovante } from "./ai/comprovante.js";
import { conversar } from "./ai/assistente.js";
import * as pedidos from "./servicos/pedidos.js";
import * as fin from "./servicos/financeiro.js";
import * as mkt from "./servicos/marketing.js";
import * as com from "./servicos/comercial.js";
import * as ops from "./servicos/operacoes.js";
import { textoListaDiaria } from "./servicos/painel.js";
import { config } from "./config.js";
import { agora, decifra, cifra, dataLocal, horaLocal, normalizaWhatsapp, reais } from "./util.js";

db.exec("CREATE TABLE IF NOT EXISTS execucoes (chave TEXT PRIMARY KEY, em TEXT)");
// Garante que uma rotina rode só uma vez por período (dia, semana, mês)
function umaVez(chave) {
  return db.prepare("INSERT OR IGNORE INTO execucoes (chave, em) VALUES (?, ?)").run(chave, agora()).changes === 1;
}

// ---------------- Mensagens de clientes (WhatsApp da revendedora) ----------------
export async function processarMensagemCliente(rev, { de, nome, texto = "", midia = null }) {
  const whatsapp = normalizaWhatsapp(de) || de;
  inserir("mensagens", { revendedora_id: rev.id, direcao: "entrada", contato: whatsapp, texto: texto || `[${midia?.tipo || "mídia"}]`, criado_em: agora() });
  const cliente = um("SELECT * FROM clientes WHERE revendedora_id = ? AND whatsapp = ?", rev.id, whatsapp);
  com.leadRespondeu(rev.id, whatsapp);
  const responder = (t) => t && enviarTexto(whatsapp, t, { revendedoraId: rev.id, emNomeDaRevendedora: true });

  // Comprovante de pagamento da cliente (foto/PDF)
  if (midia && ["image", "document"].includes(midia.tipo)) {
    const dados = await lerComprovante(midia).catch(() => null);
    const aberta = cliente && um("SELECT * FROM cobrancas WHERE revendedora_id = ? AND cliente_id = ? AND status = 'aberta' ORDER BY criado_em", rev.id, cliente.id);
    if (dados?.eh_comprovante && aberta && Math.abs(dados.valor - aberta.valor) < 0.05) {
      await fin.cobrancaPaga(aberta.id, "comprovante");
      return responder(`Pagamento de ${reais(dados.valor)} confirmado! Obrigada 💛`);
    }
    if (aberta) ops.abrirTicket(rev.id, { clienteId: cliente.id, categoria: "cobranca", assunto: `Conferir comprovante de ${cliente.nome}`, descricao: "Não consegui confirmar o valor automaticamente.", criticidade: "P3" });
    return responder("Recebi! Vou conferir aqui e já te confirmo 😊");
  }

  // Respostas a fluxos em andamento: NPS e onboarding
  if (cliente && /^\s*(10|[0-9])\s*$/.test(texto)) {
    const nps = um("SELECT 1 FROM mensagens WHERE contato = ? AND direcao = 'saida' AND texto LIKE '%de 0 a 10%' AND criado_em >= ?", whatsapp, new Date(Date.now() - 7 * 86400000).toISOString());
    if (nps) {
      const nota = Number(texto.trim());
      ops.registrarNps(rev.id, cliente, nota);
      return responder(nota >= 9 ? "Que alegria! 💛 Obrigada! Se puder, me indica pra uma amiga 😊" : "Obrigada pela sinceridade! Vou melhorar — me conta o que poderia ter sido melhor?");
    }
  }
  if (cliente?.onboarding_status === "enviado" && texto.length > 8) ops.registrarRespostaOnboarding(cliente, texto);

  const historico = todos("SELECT direcao, texto FROM mensagens WHERE revendedora_id = ? AND contato = ? ORDER BY criado_em DESC LIMIT 6", rev.id, whatsapp)
    .reverse().map((m) => `${m.direcao === "entrada" ? "Cliente" : "Revendedora"}: ${m.texto}`);
  const t = await triar({ revendedora: rev, texto, contato: { nome: cliente?.nome || nome, whatsapp }, historico });

  if (t.intencao === "pedido" && t.itens.length) {
    const p = await pedidos.criarPedido(rev.id, {
      cliente: { nome: t.nome_cliente || cliente?.nome || nome, whatsapp, endereco: t.endereco || undefined },
      itens: t.itens, origem: "whatsapp", mensagem: texto,
    });
    com.leadConverteu(rev.id, whatsapp, p.cliente_id);
    const cli = um("SELECT * FROM clientes WHERE id = ?", p.cliente_id);
    if (!cli.endereco || cli.onboarding_status === "pendente") await ops.onboardingCliente(rev.id, cli.id);
    return;
  }
  if (t.intencao === "lead") {
    await com.registrarLead(rev.id, { nome: t.nome_cliente || nome, whatsapp, interesse: t.interesse, score: t.score_lead });
    return responder(t.resposta);
  }
  if (t.intencao === "suporte") {
    const ultimo = cliente && um("SELECT id FROM pedidos WHERE cliente_id = ? ORDER BY criado_em DESC", cliente.id);
    ops.abrirTicket(rev.id, { clienteId: cliente?.id, pedidoId: ultimo?.id, categoria: t.categoria_suporte, assunto: `${t.categoria_suporte} — ${cliente?.nome || nome}`, descricao: texto, criticidade: t.criticidade, resposta: t.resposta });
    return responder(t.resposta);
  }
  if (t.intencao === "pagamento") return responder(t.resposta);
  if (configDe(rev).respostaAutomatica !== false) return responder(t.resposta);
}

// ---------------- Mensagens da própria revendedora (número oficial da RevendIA) ----------------
export async function processarMensagemRevendedora(rev, { texto = "", midia = null }) {
  inserir("mensagens", { revendedora_id: rev.id, direcao: "entrada", contato: rev.whatsapp, texto: texto || `[${midia?.tipo}]`, criado_em: agora() });
  if (midia && ["image", "document"].includes(midia.tipo)) {
    // Comprovante do boleto da marca
    const dados = await lerComprovante(midia).catch(() => null);
    const b = dados?.eh_comprovante && todos("SELECT * FROM boletos WHERE revendedora_id = ? AND status != 'pago'", rev.id).find((x) => Math.abs(x.valor - dados.valor) < 0.05);
    if (b) return pedidos.boletoPago(b.id, "comprovante enviado no WhatsApp");
    return enviarTexto(rev.whatsapp, "Recebi o arquivo, mas não consegui ligar a um boleto em aberto. Já deixei anotado pra conferência no app.", { revendedoraId: rev.id });
  }
  const r = await conversar(rev, texto);
  return enviarTexto(rev.whatsapp, r.resposta, { revendedoraId: rev.id });
}

// Webhook da Meta: roteia pelo número que recebeu a mensagem
export async function webhookWhatsapp(corpo) {
  for (const entry of corpo.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const phoneId = v.metadata?.phone_number_id;
      for (const m of v.messages || []) {
        const nome = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name || "";
        const texto = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.image?.caption || "";
        const tipoMidia = ["image", "document", "audio"].find((t) => m[t]);
        let midia = null;
        try {
          if (tipoMidia && tipoMidia !== "audio") {
            const integ = phoneId !== config.whatsapp.phoneNumberId && todos("SELECT * FROM integracoes WHERE tipo = 'whatsapp' AND status = 'conectado'").find((i) => JSON.parse(i.meta_json).phoneNumberId === phoneId);
            midia = { tipo: tipoMidia, ...(await baixarMidia(m[tipoMidia].id, integ ? decifra(integ.credenciais).token : undefined)) };
          }
        } catch (err) { console.warn("[whatsapp] mídia:", err.message); }
        try {
          if (phoneId === config.whatsapp.phoneNumberId) {
            const rev = um("SELECT * FROM revendedoras WHERE whatsapp = ?", m.from);
            if (rev) await processarMensagemRevendedora(rev, { texto, midia });
            else await enviarTexto(m.from, `Oi! Aqui é a RevendIA 💛 Conheça e assine em ${config.baseUrl}`);
          } else {
            const integ = todos("SELECT * FROM integracoes WHERE tipo = 'whatsapp' AND status = 'conectado'").find((i) => JSON.parse(i.meta_json).phoneNumberId === phoneId);
            const rev = integ && um("SELECT * FROM revendedoras WHERE id = ?", integ.revendedora_id);
            if (rev && tipoMidia === "audio" && !texto) {
              await enviarTexto(m.from, "Recebi seu áudio! 💛 Pode me escrever o que deseja? Assim já anoto certinho.", { revendedoraId: rev.id, emNomeDaRevendedora: true });
            } else if (rev && rev.piloto_automatico) await processarMensagemCliente(rev, { de: m.from, nome, texto, midia });
          }
        } catch (err) {
          console.error("[whatsapp] erro ao processar mensagem:", err);
        }
      }
    }
  }
}

// ---------------- Rotinas automáticas ----------------
async function cicloRevendedora(rev) {
  const cfg = configDe(rev);
  const passo = async (nome, fn) => { try { await fn(); } catch (err) { console.warn(`[rotina ${nome}] ${rev.id}:`, err.message); } };

  // Operações: status na marca, entregas, envio de lotes
  await passo("lotes", async () => {
    for (const lote of todos("SELECT * FROM lotes WHERE revendedora_id = ? AND status IN ('aguardando_pagamento','pago','faturado','em_transito')", rev.id)) {
      const integ = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'fornecedor' AND provedor = ?", rev.id, lote.fornecedor);
      if (!integ) continue;
      await pedidos.atualizarLote(lote, await conector(lote.fornecedor).consultarPedido(decifra(integ.credenciais), lote.pedido_fornecedor_id));
    }
    for (const l of todos("SELECT id FROM lotes WHERE revendedora_id = ? AND status = 'aberto'", rev.id)) await pedidos.tentarEnviarLote(l.id);
  });
  await passo("entregas", async () => {
    for (const p of todos("SELECT p.id FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN revendedoras r ON r.id = p.revendedora_id WHERE p.revendedora_id = ? AND p.status = 'pronto_para_entrega' AND c.endereco IS NOT NULL AND r.endereco_coleta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.pedido_id = p.id AND e.status != 'cancelado')", rev.id)) {
      if (cfg.autoMotoboy) await pedidos.chamarMotoboy(p.id);
    }
    for (const e of todos("SELECT * FROM entregas WHERE revendedora_id = ? AND status NOT IN ('entregue','cancelado')", rev.id)) {
      await pedidos.atualizarEntrega(e, (await motoboy.consultar(e)).status);
    }
  });
  await passo("monitoramento", () => ops.monitorarOperacao(rev.id));

  // Comercial e financeiro
  await passo("cadencias", () => com.rodarCadencias(rev.id));
  await passo("cobrancas", () => fin.rodarCobrancas(rev.id));
  await passo("conciliacao", () => fin.conciliar(rev.id));

  // Marketing
  await passo("instagram", async () => {
    await mkt.publicarPendentes(rev.id);
    const ig = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'instagram' AND status = 'conectado'", rev.id);
    if (ig && cfg.autoInstagram) {
      const agendados = um("SELECT COUNT(*) AS n FROM posts WHERE revendedora_id = ? AND status = 'agendado'", rev.id).n;
      if (agendados < 2) await mkt.gerarCalendario(rev.id);
      const cred = decifra(ig.credenciais);
      if (cred?.expiraEm && cred.expiraEm - Date.now() < 10 * 86400000) atualizar("integracoes", ig.id, { credenciais: cifra(await instagram.renovarToken(cred)) });
    }
  });
  await passo("campanhas", () => mkt.medirCampanhas(rev.id));

  // Rotinas por período (horário local da revendedora)
  const hoje = dataLocal(), hora = horaLocal();
  if (hora >= (cfg.horaLista ?? 8) && umaVez(`lista:${rev.id}:${hoje}`)) {
    await passo("lista_diaria", () => enviarTexto(rev.whatsapp, textoListaDiaria(rev), { revendedoraId: rev.id }));
  }
  if (hora >= 10 && umaVez(`posvenda:${rev.id}:${hoje}`)) await passo("posvenda", () => ops.rodarPosVenda(rev.id));
  const segunda = new Date().getDay() === 1;
  if (segunda && hora >= 9 && cfg.autoCampanhas && umaVez(`campanha:${rev.id}:${hoje}`)) {
    await passo("campanha_semanal", async () => {
      const [c] = await mkt.sugerirCampanhas(rev.id);
      if (c) await mkt.enviarCampanha(rev.id, c.id);
    });
  }
  if (hoje.endsWith("-01") && umaVez(`relatorio:${rev.id}:${hoje.slice(0, 7)}`)) {
    await passo("relatorio", async () => {
      const d = new Date(); d.setDate(0);
      const mes = dataLocal(d).slice(0, 7);
      const r = await fin.relatorioMensal(rev.id, mes);
      await enviarTexto(rev.whatsapp, `📊 Seu relatório de ${mes} está pronto!\n${r.analise.resumo}\n\nVeja tudo no app: ${config.baseUrl}/app/#financeiro`, { revendedoraId: rev.id });
    });
  }
}

let rodando = false;
export async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    for (const rev of todos("SELECT * FROM revendedoras WHERE assinatura_status IN ('ativa','teste') AND piloto_automatico = 1")) await cicloRevendedora(rev);
  } finally {
    rodando = false;
  }
}

export function iniciar(intervaloMs = Number(process.env.INTERVALO_ROTINAS_MS || 30000)) {
  setTimeout(tick, 3000);
  return setInterval(tick, intervaloMs);
}

export { registrarEvento };
