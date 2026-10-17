// Assistente de suporte por voz da revendedora: ela fala, a IA entende, executa e responde em voz alta.
// Ferramentas cobrem todas as áreas. Ações que movem dinheiro NUNCA são executadas: a IA orienta e abre a tela certa.
import { temIA, rodarAgente } from "./claude.js";
import { um, todos } from "../db.js";
import { resumoDoDia } from "../servicos/painel.js";
import { buscarAproximado } from "../servicos/catalogo.js";
import * as pedidos from "../servicos/pedidos.js";
import * as fin from "../servicos/financeiro.js";
import * as mkt from "../servicos/marketing.js";
import * as com from "../servicos/comercial.js";
import * as ops from "../servicos/operacoes.js";
import { reais, dataLocal } from "../util.js";

const obj = (props, req = []) => ({ type: "object", properties: props, required: req, additionalProperties: false });
const FERRAMENTAS = [
  { name: "resumo_do_dia", description: "Entregas de hoje, boletos a pagar, alertas e números do mês.", input_schema: obj({}) },
  { name: "consultar_pedidos", description: "Lista pedidos, opcionalmente filtrando por nome da cliente.", input_schema: obj({ cliente: { type: "string" } }) },
  { name: "criar_pedido", description: "Registra um pedido para uma cliente. A plataforma consolida e repassa à marca sozinha.",
    input_schema: obj({ cliente_nome: { type: "string" }, cliente_whatsapp: { type: "string" }, endereco: { type: "string" },
      itens: { type: "array", items: obj({ produto: { type: "string" }, qtd: { type: "integer" } }, ["produto", "qtd"]) } }, ["cliente_nome", "itens"]) },
  { name: "buscar_produto", description: "Procura um produto no catálogo e retorna preço e estoque.", input_schema: obj({ termo: { type: "string" } }, ["termo"]) },
  { name: "financeiro", description: "DRE do mês (receita, custo, despesas, lucro) e fluxo de caixa dos próximos 30 dias.", input_schema: obj({ mes: { type: "string", description: "AAAA-MM" } }) },
  { name: "gerar_posts", description: "Cria e agenda posts no Instagram para a semana.", input_schema: obj({ quantidade: { type: "integer" } }) },
  { name: "gerar_conteudo", description: "Cria roteiro de Reels, anúncio, stories ou carrossel.", input_schema: obj({ tipo: { type: "string", enum: ["roteiro_reels", "anuncio", "stories", "carrossel"] }, tema: { type: "string" } }, ["tipo"]) },
  { name: "sugerir_campanhas", description: "Cria sugestões de campanhas e combos promocionais.", input_schema: obj({}) },
  { name: "enviar_campanha", description: "Envia uma campanha já sugerida para a lista de transmissão.", input_schema: obj({ campanha_id: { type: "string" } }, ["campanha_id"]) },
  { name: "leads", description: "Lista os leads (interessados) por temperatura.", input_schema: obj({}) },
  { name: "criar_proposta", description: "Monta uma proposta comercial (kit) para um lead ou cliente.", input_schema: obj({ nome: { type: "string" }, objetivo: { type: "string" }, orcamento: { type: "number" } }, ["nome"]) },
  { name: "alertas", description: "Lista tickets de suporte e alertas de operação abertos.", input_schema: obj({}) },
  { name: "chamar_motoboy", description: "Chama um motoboy para um pedido pronto.", input_schema: obj({ pedido_id: { type: "string" } }, ["pedido_id"]) },
  { name: "marcar_entregue", description: "Marca um pedido como entregue.", input_schema: obj({ pedido_id: { type: "string" } }, ["pedido_id"]) },
  { name: "acao_financeira_sensivel", description: "Use SEMPRE que pedirem para pagar, transferir, sacar, mudar conta bancária ou chave Pix. Não executa: devolve orientação e abre a tela para ela confirmar manualmente.",
    input_schema: obj({ descricao: { type: "string" } }, ["descricao"]) },
  { name: "abrir_tela", description: "Abre uma tela do app.", input_schema: obj({ tela: { type: "string", enum: ["hoje", "pedidos", "catalogo", "marketing", "comercial", "operacoes", "financeiro", "integracoes", "clientes"] } }, ["tela"]) },
];

async function executar(rev, nome, e, ctx) {
  switch (nome) {
    case "resumo_do_dia": {
      const r = resumoDoDia(rev.id);
      return { entregas: r.entregas.map((x) => ({ id: x.id, cliente: x.cliente, itens: x.itens, motoboy: x.status_entrega })), boletos: r.boletos.map((b) => ({ marca: b.marca, valor: b.valor, vencimento: b.vencimento })),
        alertas: r.alertas.map((a) => `${a.criticidade} ${a.assunto}`), mes: { vendas: r.mes.receitaBruta, lucro: r.mes.lucroLiquido, pedidos: r.mes.pedidos }, a_receber: r.aReceber };
    }
    case "consultar_pedidos":
      return todos(`SELECT p.id, p.status, p.total, p.previsao_entrega, c.nome FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
        WHERE p.revendedora_id = ? AND (? IS NULL OR c.nome LIKE ?) ORDER BY p.criado_em DESC LIMIT 10`, rev.id, e.cliente || null, `%${e.cliente || ""}%`);
    case "criar_pedido": {
      const itens = [];
      for (const it of e.itens) {
        const p = buscarAproximado(rev.id, it.produto);
        if (!p) return { erro: `Não achei "${it.produto}" no catálogo` };
        itens.push({ produto_id: p.id, qtd: it.qtd || 1 });
      }
      const p = await pedidos.criarPedido(rev.id, { cliente: { nome: e.cliente_nome, whatsapp: e.cliente_whatsapp, endereco: e.endereco }, itens, origem: "voz" });
      return { pedido_id: p.id, total: p.total, status: p.status };
    }
    case "buscar_produto": {
      const p = buscarAproximado(rev.id, e.termo);
      return p ? { nome: p.nome, preco: p.preco_catalogo, custo: p.preco_custo, estoque: p.estoque, marca: p.fornecedor } : { erro: "Produto não encontrado" };
    }
    case "financeiro": {
      const d = fin.dre(rev.id, e.mes || dataLocal().slice(0, 7));
      const f = fin.fluxoCaixa(rev.id, 30);
      return { dre: d, caixa: { saldo_atual: f.saldoAtual, saldo_projetado_30d: f.saldoProjetado, alerta: f.alerta } };
    }
    case "gerar_posts": return (await mkt.gerarCalendario(rev.id, e.quantidade)).map((p) => ({ quando: p.agendado_para, objetivo: p.objetivo }));
    case "gerar_conteudo": { ctx.tela = "marketing"; const c = await mkt.gerarConteudo(rev.id, e.tipo, { tema: e.tema }); return { titulo: c.titulo, secoes: JSON.parse(c.corpo_json) }; }
    case "sugerir_campanhas": return (await mkt.sugerirCampanhas(rev.id)).map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao }));
    case "enviar_campanha": return { enviados: await mkt.enviarCampanha(rev.id, e.campanha_id) };
    case "leads": return todos("SELECT id, nome, temperatura, score, estagio, interesse FROM leads WHERE revendedora_id = ? AND estagio NOT IN ('convertido','perdido') ORDER BY score DESC LIMIT 10", rev.id);
    case "criar_proposta": {
      const lead = um("SELECT * FROM leads WHERE revendedora_id = ? AND nome LIKE ? ORDER BY criado_em DESC", rev.id, `%${e.nome}%`);
      const cli = lead ? null : um("SELECT * FROM clientes WHERE revendedora_id = ? AND nome LIKE ?", rev.id, `%${e.nome}%`);
      const p = await com.criarProposta(rev.id, { leadId: lead?.id, clienteId: cli?.id, objetivo: e.objetivo, orcamento: e.orcamento });
      ctx.tela = "comercial";
      return { proposta_id: p.id, total: p.total, texto: p.texto };
    }
    case "alertas": return ops.listarTickets(rev.id).filter((t) => t.status !== "resolvido").slice(0, 8).map((t) => ({ id: t.id, criticidade: t.criticidade, assunto: t.assunto }));
    case "chamar_motoboy": await pedidos.chamarMotoboy(e.pedido_id); return { ok: true };
    case "marcar_entregue": await pedidos.marcarEntregue(rev.id, e.pedido_id); return { ok: true };
    case "acao_financeira_sensivel":
      ctx.tela = "financeiro";
      return { bloqueado: true, motivo: "Por segurança, pagamentos, transferências e dados bancários só podem ser feitos por você, com confirmação no app. Já abri a tela financeira." };
    case "abrir_tela": ctx.tela = e.tela; return { ok: true };
    default: throw new Error("Ferramenta desconhecida");
  }
}

export async function conversar(rev, texto, historico = []) {
  const ctx = { tela: null };
  if (temIA()) {
    try {
      const msgs = historico.slice(-8).filter((m) => m.texto).map((m) => ({ role: m.de === "ia" ? "assistant" : "user", content: m.texto }));
      while (msgs.length && msgs[0].role !== "user") msgs.shift();
      const r = await rodarAgente({
        sistema:
          `Você é a Bia, assistente da plataforma RevendIA, falando com a revendedora ${rev.nome}. Ela usa você por VOZ, então responda em português do Brasil, ` +
          `em frases curtas e naturais para serem lidas em voz alta (no máximo 3 frases, sem listas longas, sem markdown, valores em reais por extenso curto como "R$ 312"). ` +
          `Use as ferramentas para consultar e agir. Você cuida de comercial, marketing, operações, financeiro e administrativo por ela. ` +
          `Nunca execute pagamentos, transferências ou alterações bancárias — use acao_financeira_sensivel. Hoje é ${dataLocal()}.`,
        mensagens: [...msgs, { role: "user", content: texto }],
        ferramentas: FERRAMENTAS,
        executar: (n, e) => executar(rev, n, e, ctx),
      });
      return { resposta: r.resposta, acoes: r.acoes.map((a) => a.ferramenta), tela: ctx.tela };
    } catch (err) {
      console.warn("[assistente] IA indisponível:", err.message);
    }
  }
  return conversarPorRegras(rev, texto, ctx);
}

// Sem IA: entende os pedidos mais comuns por palavras-chave
async function conversarPorRegras(rev, texto, ctx) {
  const t = texto.toLowerCase();
  const fala = (resposta, tela = null) => ({ resposta, acoes: [], tela });
  if (/(pag(a|ar)|transfer|saque|sacar|conta banc|chave pix)/.test(t) && !/boleto/.test(t)) {
    return fala("Por segurança, pagamentos e transferências só você faz, com confirmação no app. Abri o financeiro pra você.", "financeiro");
  }
  if (/(boleto)/.test(t)) {
    const b = resumoDoDia(rev.id).boletos;
    return fala(b.length ? `Você tem ${b.length} boleto${b.length > 1 ? "s" : ""} pra pagar, total de ${reais(b.reduce((s, x) => s + x.valor, 0))}. Assim que pagar, eu identifico sozinha.` : "Nenhum boleto pendente. Tá tudo em dia!", "hoje");
  }
  if (/(entreg|motoboy|sacol)/.test(t)) {
    const e = resumoDoDia(rev.id).entregas;
    return fala(e.length ? `Hoje você entrega ${e.length} pedido${e.length > 1 ? "s" : ""}: ${e.map((x) => x.cliente.split(" ")[0]).join(", ")}. O motoboy já está chamado.` : "Nenhuma entrega pra hoje.", "hoje");
  }
  if (/(lucr|fatur|ganhei|vend(i|eu|as)|financeiro|caixa|\bdre\b)/.test(t)) {
    const d = fin.dre(rev.id, dataLocal().slice(0, 7));
    return fala(`Neste mês você vendeu ${reais(d.receitaBruta)} em ${d.pedidos} pedidos, com lucro de ${reais(d.lucroLiquido)}.`, "financeiro");
  }
  if (/(post|instagram)/.test(t)) {
    const p = await mkt.gerarCalendario(rev.id);
    return fala(`Pronto! Criei ${p.length} posts e já agendei no seu Instagram.`, "marketing");
  }
  if (/(roteiro|reels|v[ií]deo)/.test(t)) { await mkt.gerarConteudo(rev.id, "roteiro_reels"); return fala("Criei um roteiro de Reels pra você. Tá na aba Marketing.", "marketing"); }
  if (/(an[uú]ncio|tr[aá]fego)/.test(t)) { await mkt.gerarConteudo(rev.id, "anuncio"); return fala("Seu anúncio está pronto na aba Marketing, com texto, público e orçamento.", "marketing"); }
  if (/(campanha|promo|combo)/.test(t)) {
    const c = await mkt.sugerirCampanhas(rev.id);
    return fala(`Criei ${c.length} campanhas: ${c.map((x) => x.nome).join(", ")}. Quer que eu envie?`, "marketing");
  }
  if (/(lead|interessad)/.test(t)) {
    const l = todos("SELECT nome, temperatura FROM leads WHERE revendedora_id = ? AND estagio NOT IN ('convertido','perdido') ORDER BY score DESC LIMIT 5", rev.id);
    return fala(l.length ? `Você tem ${l.length} interessados. Os mais quentes: ${l.slice(0, 3).map((x) => x.nome.split(" ")[0]).join(", ")}. Já estou fazendo o follow-up.` : "Sem leads novos agora.", "comercial");
  }
  if (/(alerta|problema|reclama|suporte)/.test(t)) {
    const a = ops.listarTickets(rev.id).filter((x) => x.status !== "resolvido");
    return fala(a.length ? `Tem ${a.length} ponto${a.length > 1 ? "s" : ""} de atenção. O mais urgente: ${a[0].assunto}.` : "Nenhum problema aberto. Operação tranquila!", "operacoes");
  }
  const r = resumoDoDia(rev.id);
  return fala(`Hoje você tem ${r.entregas.length} entrega${r.entregas.length === 1 ? "" : "s"} e ${r.boletos.length} boleto${r.boletos.length === 1 ? "" : "s"} pra pagar. O resto eu cuido. Pode me pedir posts, campanhas, propostas ou o resumo do financeiro.`, "hoje");
}
