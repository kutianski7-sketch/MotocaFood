// API do app da revendedora (todas as rotas exigem login).
import express from "express";
import { um, todos, inserir, atualizar, exec, registrarEvento, configDe } from "../db.js";
import { autenticar, exigirConfirmacao } from "./auth.js";
import { config } from "../config.js";
import { conector, infoMarca } from "../integracoes/fornecedores/index.js";
import { MARCAS } from "../integracoes/fornecedores/catalogo-base.js";
import * as instagram from "../integracoes/instagram.js";
import * as motoboy from "../integracoes/motoboy.js";
import { concluirCadastroIncorporado } from "../integracoes/whatsapp.js";
import * as catalogo from "../servicos/catalogo.js";
import * as pedidos from "../servicos/pedidos.js";
import * as fin from "../servicos/financeiro.js";
import * as mkt from "../servicos/marketing.js";
import * as com from "../servicos/comercial.js";
import * as ops from "../servicos/operacoes.js";
import { resumoDoDia } from "../servicos/painel.js";
import { conversar } from "../ai/assistente.js";
import { temIA } from "../ai/claude.js";
import { triar } from "../ai/triagem.js";
import { processarMensagemCliente, tick } from "../orquestrador.js";
import { agora, cifra, decifra, hash, dataLocal, normalizaWhatsapp } from "../util.js";

export const rotas = express.Router();

// Callback do OAuth do Instagram chega sem sessão de API (vem do navegador); validamos pelo "state" assinado
rotas.get("/integracoes/instagram/callback", async (req, res) => {
  try {
    const [revId, assinatura] = String(req.query.state || "").split(".");
    if (!revId || hash(`ig:${revId}`) !== assinatura) throw new Error("Estado inválido");
    const cred = await instagram.trocarCodigo(req.query.code);
    salvarIntegracao(revId, "instagram", "instagram", cred, { usuario: cred.usuario });
    registrarEvento(revId, "integracao", `Instagram @${cred.usuario} conectado`);
    res.redirect("/app/#integracoes");
  } catch (e) {
    res.redirect(`/app/#integracoes?erro=${encodeURIComponent(e.message)}`);
  }
});

rotas.use(autenticar);
const ok = (fn) => async (req, res) => {
  try { res.json((await fn(req, res)) ?? { ok: true }); } catch (e) { console.warn("[api]", req.path, e.message); res.status(e.status || 400).json({ erro: e.message }); }
};
const R = (req) => req.rev.id;

function salvarIntegracao(revId, tipo, provedor, cred, meta = {}) {
  exec(`INSERT INTO integracoes (id, revendedora_id, tipo, provedor, status, credenciais, meta_json, atualizado_em) VALUES (?, ?, ?, ?, 'conectado', ?, ?, ?)
    ON CONFLICT(revendedora_id, tipo, provedor) DO UPDATE SET status = 'conectado', credenciais = excluded.credenciais, meta_json = excluded.meta_json, atualizado_em = excluded.atualizado_em`,
    `in_${revId.slice(-6)}_${tipo}_${provedor}`, revId, tipo, provedor, cifra(cred), JSON.stringify(meta), agora());
}

// ---------------- Conta ----------------
rotas.get("/conta", ok((req) => {
  const r = req.rev;
  return { id: r.id, nome: r.nome, whatsapp: r.whatsapp, cidade: r.cidade, endereco_coleta: r.endereco_coleta, chave_pix: r.chave_pix ? r.chave_pix.replace(/.(?=.{4})/g, "•") : null,
    plano: r.plano, assinatura_status: r.assinatura_status, assinatura_ate: r.assinatura_ate, piloto_automatico: !!r.piloto_automatico, config: configDe(r), ia: temIA(), demo: config.demo };
}));
rotas.put("/conta", ok((req) => {
  const { nome, cidade, endereco_coleta, piloto_automatico, config: cfg } = req.body;
  const campos = {};
  if (nome) campos.nome = nome;
  if (cidade !== undefined) campos.cidade = cidade;
  if (endereco_coleta !== undefined) campos.endereco_coleta = endereco_coleta;
  if (piloto_automatico !== undefined) campos.piloto_automatico = piloto_automatico ? 1 : 0;
  if (cfg) {
    const permitido = ["autoMotoboy", "autoInstagram", "autoCampanhas", "respostaAutomatica", "horaLista", "postsPorSemana", "tom", "margemPadrao"];
    campos.config_json = JSON.stringify({ ...JSON.parse(req.rev.config_json || "{}"), ...Object.fromEntries(Object.entries(cfg).filter(([k]) => permitido.includes(k))) });
  }
  atualizar("revendedoras", R(req), campos);
}));
// Dados para receber dinheiro: ação sensível, exige código do WhatsApp
rotas.put("/conta/recebimento", exigirConfirmacao, ok((req) => {
  if (!req.body.chave_pix?.trim()) throw new Error("Informe a chave Pix");
  atualizar("revendedoras", R(req), { chave_pix: req.body.chave_pix.trim() });
  registrarEvento(R(req), "seguranca", "Chave Pix de recebimento alterada (confirmada por código)");
}));

// ---------------- Hoje ----------------
rotas.get("/hoje", ok((req) => resumoDoDia(R(req))));

// ---------------- Integrações ----------------
rotas.get("/integracoes", ok((req) => ({
  marcas: MARCAS,
  conectadas: todos("SELECT id, tipo, provedor, status, meta_json, atualizado_em FROM integracoes WHERE revendedora_id = ?", R(req)).map((i) => ({ ...i, meta: JSON.parse(i.meta_json) })),
  disponivel: { instagramReal: instagram.real(), whatsappReal: Boolean(config.whatsapp.appId && config.whatsapp.embeddedSignupConfigId), motoboyReal: motoboy.real(),
    metaAppId: config.whatsapp.appId, embeddedSignupConfigId: config.whatsapp.embeddedSignupConfigId, demo: config.demo },
})));

rotas.post("/integracoes/fornecedor", ok(async (req) => {
  const { marca, codigo, senha } = req.body;
  if (!infoMarca(marca) || marca === "outra") throw new Error("Escolha a marca");
  const r = await conector(marca).conectar({ codigo, senha });
  salvarIntegracao(R(req), "fornecedor", marca, { codigo, senha, token: r.token }, { conta: r.conta, nome: r.nomeExibicao });
  const n = await catalogo.sincronizar(R(req), marca);
  registrarEvento(R(req), "integracao", `${infoMarca(marca).nome} conectado`);
  return { ok: true, produtos: n };
}));
rotas.post("/integracoes/fornecedor/:marca/sincronizar", ok(async (req) => ({ produtos: await catalogo.sincronizar(R(req), req.params.marca) })));

rotas.get("/integracoes/instagram/conectar", (req, res) => {
  if (instagram.real()) return res.json({ url: instagram.urlAutorizacao(`${R(req)}.${hash(`ig:${R(req)}`)}`) });
  if (!config.demo) return res.status(400).json({ erro: "Instagram não configurado no servidor" });
  salvarIntegracao(R(req), "instagram", "instagram", { simulado: true }, { usuario: `${req.rev.nome.split(" ")[0].toLowerCase()}.cosmeticos` });
  registrarEvento(R(req), "integracao", "Instagram conectado (demonstração)");
  res.json({ ok: true });
});

rotas.post("/integracoes/whatsapp", ok(async (req) => {
  const { code, phoneNumberId, wabaId } = req.body;
  if (code) {
    const token = await concluirCadastroIncorporado(code);
    // registra o número na Cloud API e assina os webhooks da conta
    await fetch(`${config.whatsapp.graph}/${phoneNumberId}/register`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", pin: String(Math.floor(100000 + Math.random() * 900000)) }) });
    await fetch(`${config.whatsapp.graph}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    salvarIntegracao(R(req), "whatsapp", "meta", { token, phoneNumberId, wabaId }, { phoneNumberId, wabaId });
  } else if (config.demo) {
    salvarIntegracao(R(req), "whatsapp", "meta", { simulado: true }, { phoneNumberId: `demo_${R(req)}`, numero: req.rev.whatsapp });
  } else throw new Error("Conclua a conexão pelo botão do WhatsApp");
  registrarEvento(R(req), "integracao", "WhatsApp Business conectado — pedidos, avisos e lista de transmissão no automático");
}));

rotas.post("/integracoes/motoboy", ok((req) => {
  salvarIntegracao(R(req), "motoboy", motoboy.real() ? "lalamove" : "simulado", {}, { coleta: req.rev.endereco_coleta });
  registrarEvento(R(req), "integracao", "Entregas por motoboy ativadas");
}));

rotas.delete("/integracoes/:id", ok((req) => { exec("DELETE FROM integracoes WHERE id = ? AND revendedora_id = ?", req.params.id, R(req)); }));

// "Deixa com a IA": configura tudo o que dá automaticamente e devolve só o que precisa de um toque dela
rotas.post("/integracoes/automatico", ok(async (req) => {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", R(req));
  const feito = [], pendente = [];
  const tem = (tipo) => um("SELECT id FROM integracoes WHERE revendedora_id = ? AND tipo = ?", rev.id, tipo);
  if (!tem("fornecedor")) pendente.push({ passo: "fornecedor", texto: "Conecte sua conta da marca (Boticário, Natura...) com seu código de revendedora" });
  else feito.push("Catálogo da marca sincronizado");
  if (!tem("whatsapp")) {
    if (config.demo && !config.whatsapp.embeddedSignupConfigId) { salvarIntegracao(rev.id, "whatsapp", "meta", { simulado: true }, { phoneNumberId: `demo_${rev.id}`, numero: rev.whatsapp }); feito.push("WhatsApp Business conectado"); }
    else pendente.push({ passo: "whatsapp", texto: "Toque em 'Conectar WhatsApp' e confirme na janela da Meta" });
  } else feito.push("WhatsApp Business conectado");
  if (!tem("instagram")) {
    if (config.demo && !instagram.real()) { salvarIntegracao(rev.id, "instagram", "instagram", { simulado: true }, { usuario: `${rev.nome.split(" ")[0].toLowerCase()}.cosmeticos` }); feito.push("Instagram conectado"); }
    else pendente.push({ passo: "instagram", texto: "Toque em 'Conectar Instagram' e autorize" });
  } else feito.push("Instagram conectado");
  if (!rev.endereco_coleta) pendente.push({ passo: "endereco", texto: "Informe o endereço onde o motoboy retira os pedidos" });
  else if (!tem("motoboy")) { salvarIntegracao(rev.id, "motoboy", motoboy.real() ? "lalamove" : "simulado", {}, { coleta: rev.endereco_coleta }); feito.push("Motoboy ativado"); }
  if (!rev.chave_pix) pendente.push({ passo: "pix", texto: "Cadastre sua chave Pix para receber das clientes (pede código de segurança)" });
  // Importa clientes das conversas existentes para a lista de transmissão
  const n = exec(`UPDATE clientes SET na_lista_transmissao = 1 WHERE revendedora_id = ? AND whatsapp IS NOT NULL`, rev.id).changes;
  if (n) feito.push(`${n} clientes na lista de transmissão`);
  if (tem("fornecedor")) {
    if (tem("instagram") && !um("SELECT id FROM posts WHERE revendedora_id = ? AND status = 'agendado'", rev.id)) { await mkt.gerarCalendario(rev.id); feito.push("Posts da semana criados e agendados"); }
    if (!um("SELECT id FROM campanhas WHERE revendedora_id = ?", rev.id)) { await mkt.sugerirCampanhas(rev.id); feito.push("Campanhas e combos do ciclo prontos"); }
  }
  atualizar("revendedoras", rev.id, { piloto_automatico: 1 });
  return { feito, pendente, pronto: pendente.length === 0 };
}));

// ---------------- Catálogo ----------------
rotas.get("/catalogo", ok((req) => catalogo.listar(R(req))));
rotas.post("/catalogo", ok((req) => catalogo.adicionarManual(R(req), req.body)));
rotas.post("/catalogo/importar", ok((req) => ({ importados: catalogo.importarCSV(R(req), req.body.csv || "") })));
rotas.put("/catalogo/:id", ok((req) => {
  const p = um("SELECT * FROM produtos WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!p) throw new Error("Produto não encontrado");
  const { estoque, preco_catalogo, ativo } = req.body;
  atualizar("produtos", p.id, { estoque: estoque ?? p.estoque, preco_catalogo: preco_catalogo ?? p.preco_catalogo, ativo: ativo === undefined ? p.ativo : ativo ? 1 : 0 });
}));

// ---------------- Pedidos ----------------
rotas.get("/pedidos", ok((req) => todos(`SELECT p.*, c.nome AS cliente_nome, (SELECT GROUP_CONCAT(i.qtd || 'x ' || i.nome, ', ') FROM itens_pedido i WHERE i.pedido_id = p.id) AS itens
  FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.revendedora_id = ? ORDER BY p.criado_em DESC LIMIT 200`, R(req))));
rotas.get("/pedidos/:id", ok((req) => {
  const p = pedidos.detalhar(req.params.id);
  if (!p || p.revendedora_id !== R(req)) throw new Error("Pedido não encontrado");
  return p;
}));
rotas.post("/pedidos", ok((req) => pedidos.criarPedido(R(req), { cliente: req.body.cliente || {}, itens: req.body.itens, origem: "manual", observacao: req.body.observacao })));
// Cola a mensagem da cliente e a IA monta o pedido
rotas.post("/pedidos/interpretar", ok(async (req) => {
  const { texto, cliente = {} } = req.body;
  const t = await triar({ revendedora: req.rev, texto, contato: cliente });
  if (t.intencao !== "pedido" || !t.itens.length) return { criado: false, triagem: t };
  const p = await pedidos.criarPedido(R(req), { cliente: { nome: cliente.nome || t.nome_cliente, whatsapp: cliente.whatsapp, endereco: cliente.endereco || t.endereco }, itens: t.itens, origem: "colado", mensagem: texto });
  return { criado: true, pedido: pedidos.detalhar(p.id) };
}));
rotas.post("/pedidos/:id/motoboy", ok((req) => pedidos.chamarMotoboy(req.params.id)));
rotas.post("/pedidos/:id/entregue", ok((req) => pedidos.marcarEntregue(R(req), req.params.id)));
rotas.post("/pedidos/:id/cancelar", ok((req) => {
  const p = um("SELECT * FROM pedidos WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!p || !["novo", "aguardando_lote", "pronto_para_entrega"].includes(p.status)) throw new Error("Este pedido já foi enviado à marca e não pode ser cancelado aqui");
  atualizar("pedidos", p.id, { status: "cancelado" });
  exec("UPDATE itens_pedido SET lote_id = NULL WHERE pedido_id = ?", p.id);
  exec("UPDATE produtos SET estoque = estoque + (SELECT COALESCE(SUM(qtd),0) FROM itens_pedido WHERE pedido_id = ? AND produto_id = produtos.id AND de_estoque = 1) WHERE revendedora_id = ?", p.id, R(req));
  exec("DELETE FROM lancamentos WHERE pedido_id = ? AND status = 'previsto'", p.id);
  exec("UPDATE cobrancas SET status = 'cancelada' WHERE pedido_id = ?", p.id);
}));
rotas.post("/lotes/:id/enviar", ok(async (req) => {
  const l = um("SELECT * FROM lotes WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!l) throw new Error("Lote não encontrado");
  return (await pedidos.tentarEnviarLote(l.id, { forcar: true })) || { erro: "Conecte a marca para enviar automaticamente" };
}));
// "Já paguei": a confirmação definitiva vem da marca/extrato/comprovante
rotas.post("/boletos/:id/paguei", ok(async (req) => {
  const b = um("SELECT * FROM boletos WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!b) throw new Error("Boleto não encontrado");
  atualizar("boletos", b.id, { status: "informado" });
  const lote = um("SELECT * FROM lotes WHERE id = ?", b.lote_id);
  if (config.demo && lote) conector(lote.fornecedor).marcarPago?.(lote.pedido_fornecedor_id);
  setTimeout(() => tick().catch(() => {}), 1500);
  return { ok: true, mensagem: "Obrigada! Vou identificar o pagamento junto à marca e te aviso." };
}));

// ---------------- Clientes ----------------
rotas.get("/clientes", ok((req) => ops.saudeCarteira(R(req))));
rotas.post("/clientes", ok(async (req) => {
  const c = pedidos.obterOuCriarCliente(R(req), req.body);
  if (req.body.aniversario) atualizar("clientes", c.id, { aniversario: req.body.aniversario });
  await ops.onboardingCliente(R(req), c.id);
  return c;
}));

// ---------------- Marketing ----------------
rotas.get("/marketing", ok((req) => ({
  posts: todos("SELECT p.*, pr.nome AS produto_nome FROM posts p LEFT JOIN produtos pr ON pr.id = p.produto_id WHERE p.revendedora_id = ? ORDER BY p.agendado_para DESC LIMIT 40", R(req)),
  conteudos: todos("SELECT * FROM conteudos WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 30", R(req)).map((c) => ({ ...c, secoes: JSON.parse(c.corpo_json) })),
  campanhas: todos("SELECT * FROM campanhas WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 30", R(req)).map((c) => ({ ...c, resultado: JSON.parse(c.resultado_json || "{}") })),
  datas: mkt.proximasDatas(60).map((d) => ({ nome: d.nome, data: d.data.toISOString().slice(0, 10) })),
  instagram: um("SELECT meta_json FROM integracoes WHERE revendedora_id = ? AND tipo = 'instagram'", R(req)) ? true : false,
})));
rotas.post("/marketing/posts/gerar", ok((req) => mkt.gerarCalendario(R(req), req.body.quantidade)));
rotas.put("/marketing/posts/:id", ok((req) => {
  const p = um("SELECT * FROM posts WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!p) throw new Error("Post não encontrado");
  atualizar("posts", p.id, { legenda: req.body.legenda ?? p.legenda, agendado_para: req.body.agendado_para ?? p.agendado_para, status: req.body.status ?? p.status });
}));
rotas.post("/marketing/posts/publicar", ok(async (req) => {
  exec("UPDATE posts SET agendado_para = ? WHERE id = ? AND revendedora_id = ?", agora(), req.body.id, R(req));
  return { publicados: await mkt.publicarPendentes(R(req)) };
}));
rotas.post("/marketing/conteudos", ok((req) => mkt.gerarConteudo(R(req), req.body.tipo, { tema: req.body.tema, produtoId: req.body.produtoId })));
rotas.post("/marketing/campanhas/sugerir", ok((req) => mkt.sugerirCampanhas(R(req))));
rotas.post("/marketing/campanhas/:id/enviar", ok(async (req) => ({ enviados: await mkt.enviarCampanha(R(req), req.params.id) })));

// ---------------- Comercial ----------------
rotas.get("/comercial", ok((req) => ({
  leads: todos("SELECT * FROM leads WHERE revendedora_id = ? ORDER BY CASE estagio WHEN 'convertido' THEN 2 WHEN 'perdido' THEN 3 ELSE 1 END, score DESC LIMIT 100", R(req)),
  propostas: todos("SELECT * FROM propostas WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 30", R(req)),
  analises: todos("SELECT * FROM analises_conversa WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 20", R(req)).map((a) => ({ ...a, analise: JSON.parse(a.analise_json) })),
  cadencias: com.CADENCIAS,
})));
rotas.post("/comercial/leads", ok((req) => com.registrarLead(R(req), { ...req.body, origem: req.body.origem || "manual" })));
rotas.put("/comercial/leads/:id", ok((req) => {
  const l = um("SELECT * FROM leads WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!l) throw new Error("Lead não encontrado");
  atualizar("leads", l.id, { estagio: req.body.estagio ?? l.estagio, notas: req.body.notas ?? l.notas, proxima_acao_em: ["convertido", "perdido"].includes(req.body.estagio) ? null : l.proxima_acao_em });
}));
rotas.post("/comercial/propostas", ok((req) => com.criarProposta(R(req), req.body)));
rotas.post("/comercial/propostas/:id/enviar", ok((req) => com.enviarProposta(R(req), req.params.id)));
rotas.post("/comercial/analises", ok(async (req) => {
  const a = await com.analisarConversa(R(req), req.body);
  return { ...a, analise: JSON.parse(a.analise_json) };
}));

// ---------------- Operações ----------------
rotas.get("/operacoes", ok((req) => ({ tickets: ops.listarTickets(R(req)), saude: ops.saudeCarteira(R(req)).resumo, sla: ops.SLA_HORAS })));
rotas.post("/operacoes/monitorar", ok(async (req) => ({ novos: await ops.monitorarOperacao(R(req)) })));
rotas.put("/operacoes/tickets/:id/resolver", ok((req) => ops.resolverTicket(R(req), req.params.id, req.body.resposta)));

// ---------------- Financeiro ----------------
rotas.get("/financeiro", ok((req) => {
  const mes = req.query.mes || dataLocal().slice(0, 7);
  return {
    dre: fin.dre(R(req), mes), serie: fin.serieMensal(R(req), 6), caixa: fin.fluxoCaixa(R(req), 30), top: fin.maisVendidos(R(req), 90, 5),
    cobrancas: todos("SELECT co.*, c.nome FROM cobrancas co JOIN clientes c ON c.id = co.cliente_id WHERE co.revendedora_id = ? AND co.status = 'aberta' ORDER BY co.vencimento", R(req)),
    extrato: todos("SELECT * FROM extrato WHERE revendedora_id = ? ORDER BY data DESC LIMIT 50", R(req)),
    relatorios: todos("SELECT mes, analise FROM relatorios WHERE revendedora_id = ? ORDER BY mes DESC LIMIT 12", R(req)).map((r) => ({ mes: r.mes, analise: JSON.parse(r.analise) })),
  };
}));
rotas.get("/financeiro/relatorio", ok((req) => fin.relatorioMensal(R(req), req.query.mes || dataLocal().slice(0, 7))));
rotas.post("/financeiro/lancamentos", ok((req) => {
  const { tipo = "despesa", categoria = "Outros", descricao = "", valor, data } = req.body;
  if (!(Number(valor) > 0)) throw new Error("Valor inválido");
  return inserir("lancamentos", { revendedora_id: R(req), tipo, categoria, descricao, valor: Number(valor), data: data || agora().slice(0, 10), status: "realizado" });
}));
rotas.post("/financeiro/extrato", ok((req) => fin.importarExtrato(R(req), req.body.conteudo || "")));
rotas.post("/financeiro/extrato/:id/classificar", ok((req) => fin.classificarExtrato(R(req), req.params.id, req.body.categoria || "Outros")));
// Marcar recebimento de cliente é registro (não move dinheiro), então não exige código
rotas.post("/financeiro/cobrancas/:id/paga", ok((req) => {
  const c = um("SELECT * FROM cobrancas WHERE id = ? AND revendedora_id = ?", req.params.id, R(req));
  if (!c) throw new Error("Cobrança não encontrada");
  return fin.cobrancaPaga(c.id, "informado pela revendedora");
}));

// ---------------- Assistente por voz ----------------
rotas.post("/assistente", ok((req) => conversar(req.rev, String(req.body.texto || "").slice(0, 2000), req.body.historico || [])));

// ---------------- Atividade dos agentes ----------------
rotas.get("/agentes", ok((req) => {
  const n = (sql) => um(sql, R(req)).n;
  return {
    comercial: { leads_ativos: n("SELECT COUNT(*) n FROM leads WHERE revendedora_id = ? AND estagio IN ('novo','qualificado','proposta')"), propostas: n("SELECT COUNT(*) n FROM propostas WHERE revendedora_id = ?"), convertidos: n("SELECT COUNT(*) n FROM leads WHERE revendedora_id = ? AND estagio = 'convertido'") },
    marketing: { agendados: n("SELECT COUNT(*) n FROM posts WHERE revendedora_id = ? AND status = 'agendado'"), publicados: n("SELECT COUNT(*) n FROM posts WHERE revendedora_id = ? AND status = 'publicado'"), conteudos: n("SELECT COUNT(*) n FROM conteudos WHERE revendedora_id = ?"), campanhas: n("SELECT COUNT(*) n FROM campanhas WHERE revendedora_id = ? AND status IN ('enviada','concluida')") },
    operacoes: { em_andamento: n("SELECT COUNT(*) n FROM pedidos WHERE revendedora_id = ? AND status NOT IN ('entregue','cancelado')"), tickets_abertos: n("SELECT COUNT(*) n FROM tickets WHERE revendedora_id = ? AND status != 'resolvido'"), entregues: n("SELECT COUNT(*) n FROM pedidos WHERE revendedora_id = ? AND status = 'entregue'") },
    financeiro: { cobrancas_abertas: n("SELECT COUNT(*) n FROM cobrancas WHERE revendedora_id = ? AND status = 'aberta'"), conciliados: n("SELECT COUNT(*) n FROM extrato WHERE revendedora_id = ? AND status = 'conciliado'"), pendentes_conciliacao: n("SELECT COUNT(*) n FROM extrato WHERE revendedora_id = ? AND status = 'pendente'") },
    eventos: todos("SELECT * FROM eventos WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 40", R(req)),
  };
}));

// ---------------- Simulador (demonstração) ----------------
rotas.post("/simular/mensagem", ok(async (req) => {
  if (!config.demo) throw new Error("Disponível apenas no modo demonstração");
  const de = normalizaWhatsapp(req.body.de) || "5511900000000";
  await processarMensagemCliente(req.rev, { de, nome: req.body.nome || "Cliente", texto: String(req.body.texto || "") });
  return { conversa: todos("SELECT direcao, texto, criado_em FROM mensagens WHERE revendedora_id = ? AND contato = ? ORDER BY criado_em", R(req), de) };
}));
rotas.post("/simular/tick", ok(async () => { if (!config.demo) throw new Error("Indisponível"); await tick(); }));
rotas.get("/mensagens", ok((req) => todos("SELECT * FROM mensagens WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 60", R(req))));
