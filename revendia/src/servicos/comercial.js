// Agente comercial: triagem e pontuação de leads, follow-up com cadências, propostas comerciais e análise de conversas.
import { um, todos, inserir, atualizar, registrarEvento } from "../db.js";
import { enviarTexto } from "../integracoes/whatsapp.js";
import { temIA, gerarJSON } from "../ai/claude.js";
import { listar } from "./catalogo.js";
import { maisVendidos } from "./financeiro.js";
import { agora, somaDias, reais, centavos, normalizaWhatsapp } from "../util.js";

// Cadências (em dias após a entrada do lead). {nome} e {interesse} são substituídos.
export const CADENCIAS = {
  lead_quente: [
    { dia: 0, texto: "Oi, {nome}! Separei aqui as opções de {interesse} pra você 💛 Quer que eu reserve uma?" },
    { dia: 1, texto: "{nome}, ainda tenho o {interesse} disponível! Entrego por motoboy rapidinho 🛵" },
    { dia: 3, texto: "Última chamada, {nome}: o ciclo fecha logo e o preço muda. Garanto o seu?" },
  ],
  lead_morno: [
    { dia: 0, texto: "Oi, {nome}! Que bom falar com você 😊 Posso te mandar as promoções do ciclo?" },
    { dia: 2, texto: "{nome}, olha que lindo esse lançamento! Se quiser, te mando foto e preço." },
    { dia: 6, texto: "{nome}, tô montando os pedidos da semana. Quer incluir alguma coisinha?" },
    { dia: 14, texto: "Oi, {nome}! Novo ciclo com novidades 💛 Quer ver?" },
  ],
  lead_frio: [
    { dia: 0, texto: "Oi, {nome}! Obrigada pelo contato 💛 Fico à disposição pra qualquer dúvida." },
    { dia: 7, texto: "{nome}, chegaram novidades do ciclo! Posso te mandar?" },
    { dia: 21, texto: "Oi, {nome}! Passando pra te desejar uma ótima semana e avisar que tem promoção nova 😊" },
  ],
};
const temperatura = (score) => (score >= 70 ? "quente" : score >= 40 ? "morno" : "frio");

export async function registrarLead(revendedoraId, { nome, whatsapp, origem = "whatsapp", interesse = "", score = 50, notas = "" }) {
  const w = normalizaWhatsapp(whatsapp) || whatsapp;
  let lead = um("SELECT * FROM leads WHERE revendedora_id = ? AND whatsapp = ? AND estagio NOT IN ('convertido','perdido')", revendedoraId, w);
  const temp = temperatura(score);
  if (lead) {
    atualizar("leads", lead.id, { score: Math.max(lead.score, score), temperatura: temperatura(Math.max(lead.score, score)), interesse: interesse || lead.interesse, ultima_interacao_em: agora() });
    return um("SELECT * FROM leads WHERE id = ?", lead.id);
  }
  lead = inserir("leads", { revendedora_id: revendedoraId, nome: nome || "Contato", whatsapp: w, origem, interesse, score, temperatura: temp, estagio: "novo",
    cadencia: `lead_${temp}`, passo_cadencia: 1, proxima_acao_em: somaDias(new Date(), CADENCIAS[`lead_${temp}`][1]?.dia ?? 1).toISOString(),
    ultima_interacao_em: agora(), notas, criado_em: agora() });
  registrarEvento(revendedoraId, "lead", `Novo lead ${temp} (${score}): ${lead.nome} — ${interesse || origem}`);
  return lead;
}

// Roda o próximo passo da cadência para quem está na hora e não respondeu/comprou
export async function rodarCadencias(revendedoraId) {
  let n = 0;
  for (const l of todos("SELECT * FROM leads WHERE revendedora_id = ? AND estagio IN ('novo','qualificado','proposta') AND proxima_acao_em <= ?", revendedoraId, agora())) {
    const passos = CADENCIAS[l.cadencia] || CADENCIAS.lead_morno;
    const passo = passos[l.passo_cadencia];
    if (!passo) { atualizar("leads", l.id, { estagio: "perdido", proxima_acao_em: null, notas: `${l.notas || ""}\nCadência concluída sem resposta.` }); continue; }
    const texto = passo.texto.replace("{nome}", l.nome.split(" ")[0]).replace("{interesse}", l.interesse || "os produtos");
    await enviarTexto(l.whatsapp, texto, { revendedoraId, emNomeDaRevendedora: true });
    const prox = passos[l.passo_cadencia + 1];
    atualizar("leads", l.id, { passo_cadencia: l.passo_cadencia + 1, proxima_acao_em: prox ? somaDias(l.criado_em, prox.dia).toISOString() : somaDias(new Date(), 3).toISOString() });
    n++;
  }
  if (n) registrarEvento(revendedoraId, "lead", `${n} follow-up(s) enviados pelas cadências`);
  return n;
}

// Lead respondeu ou comprou: pausa a cadência / converte
export function leadRespondeu(revendedoraId, whatsapp) {
  const l = um("SELECT * FROM leads WHERE revendedora_id = ? AND whatsapp = ? AND estagio IN ('novo','qualificado','proposta')", revendedoraId, whatsapp);
  if (l) atualizar("leads", l.id, { estagio: l.estagio === "novo" ? "qualificado" : l.estagio, ultima_interacao_em: agora(), proxima_acao_em: somaDias(new Date(), 1).toISOString() });
}
export function leadConverteu(revendedoraId, whatsapp, clienteId) {
  const l = um("SELECT * FROM leads WHERE revendedora_id = ? AND whatsapp = ? AND estagio != 'convertido'", revendedoraId, whatsapp);
  if (l) atualizar("leads", l.id, { estagio: "convertido", cliente_id: clienteId, proxima_acao_em: null });
}

// ---------- Propostas comerciais (kits personalizados, presentes corporativos, revenda em grupo) ----------
export async function criarProposta(revendedoraId, { leadId, clienteId, objetivo = "", orcamento, produtos: ids = [], descontoPct = 0 }) {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  const lead = leadId ? um("SELECT * FROM leads WHERE id = ?", leadId) : null;
  const cli = clienteId ? um("SELECT * FROM clientes WHERE id = ?", clienteId) : null;
  const nome = lead?.nome || cli?.nome || "Cliente";
  const catalogo = listar(revendedoraId);
  let escolhidos = ids.map((i) => catalogo.find((p) => p.id === i)).filter(Boolean);
  if (!escolhidos.length) {
    // Monta um kit com os mais vendidos dentro do orçamento
    const top = maisVendidos(revendedoraId, 90, 10).map((t) => catalogo.find((p) => p.id === t.produto_id)).filter(Boolean);
    let soma = 0;
    for (const p of (top.length ? top : catalogo)) {
      if (orcamento && soma + p.preco_catalogo > orcamento) continue;
      escolhidos.push(p); soma += p.preco_catalogo;
      if (escolhidos.length >= 4) break;
    }
  }
  const itens = escolhidos.map((p) => ({ produto_id: p.id, nome: p.nome, qtd: 1, preco: p.preco_catalogo }));
  const subtotal = centavos(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
  const total = centavos(subtotal * (1 - descontoPct / 100));
  let texto = `Proposta para ${nome}${objetivo ? ` — ${objetivo}` : ""}\n\n` +
    itens.map((i) => `• ${i.qtd}x ${i.nome} — ${reais(i.preco)}`).join("\n") +
    `\n\nSubtotal: ${reais(subtotal)}${descontoPct ? `\nDesconto especial: ${descontoPct}%` : ""}\nTotal: ${reais(total)}\n` +
    `Pagamento: Pix ou cartão (parcelo). Entrega por motoboy.\nValidade: 7 dias.\n\n${rev.nome} — Revendedora autorizada`;
  if (temIA()) {
    try {
      const r = await gerarJSON({
        sistema: "Você escreve propostas comerciais curtas e elegantes para revendedoras de cosméticos enviarem no WhatsApp. Mantenha todos os itens, preços e totais exatamente como fornecidos.",
        mensagem: `Reescreva de forma persuasiva e calorosa (máx. 900 caracteres), mantendo os números:\n\n${texto}`,
        schema: { type: "object", additionalProperties: false, required: ["texto"], properties: { texto: { type: "string" } } },
      });
      if (r.texto.includes(reais(total).replace(/\s/g, " ").slice(3, 8))) texto = r.texto;
    } catch (err) { console.warn("[proposta] IA:", err.message); }
  }
  const prop = inserir("propostas", { revendedora_id: revendedoraId, lead_id: lead?.id, cliente_id: cli?.id, titulo: objetivo || `Proposta ${nome}`,
    itens_json: JSON.stringify(itens), subtotal, desconto_pct: descontoPct, total, validade: somaDias(new Date(), 7).toISOString().slice(0, 10), texto, status: "rascunho", criado_em: agora() });
  if (lead) atualizar("leads", lead.id, { estagio: "proposta" });
  return prop;
}

export async function enviarProposta(revendedoraId, propostaId) {
  const p = um("SELECT * FROM propostas WHERE id = ? AND revendedora_id = ?", propostaId, revendedoraId);
  if (!p) throw new Error("Proposta não encontrada");
  const destino = p.lead_id ? um("SELECT whatsapp FROM leads WHERE id = ?", p.lead_id)?.whatsapp : um("SELECT whatsapp FROM clientes WHERE id = ?", p.cliente_id)?.whatsapp;
  if (!destino) throw new Error("Contato sem WhatsApp");
  await enviarTexto(destino, p.texto, { revendedoraId, emNomeDaRevendedora: true });
  atualizar("propostas", p.id, { status: "enviada" });
}

// ---------- Análise de conversas/calls ----------
// Recebe a transcrição de uma ligação, áudio ou conversa de WhatsApp e devolve diagnóstico + próximos passos.
export async function analisarConversa(revendedoraId, { contato = "", canal = "whatsapp", transcricao }) {
  if (!transcricao?.trim()) throw new Error("Cole a conversa ou a transcrição da ligação");
  let analise = null;
  if (temIA()) {
    try {
      analise = await gerarJSON({
        sistema: "Você é coach de vendas consultivas de cosméticos. Analise a conversa entre a revendedora e o cliente. Seja específica, prática e gentil.",
        mensagem: `Canal: ${canal}. Contato: ${contato}.\n\nCONVERSA:\n${transcricao}`,
        schema: { type: "object", additionalProperties: false,
          required: ["resumo", "sentimento", "probabilidade_compra", "objecoes", "oportunidades", "pontos_fortes", "melhorias", "proxima_mensagem"],
          properties: {
            resumo: { type: "string" }, sentimento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
            probabilidade_compra: { type: "integer" }, objecoes: { type: "array", items: { type: "string" } },
            oportunidades: { type: "array", items: { type: "string" } }, pontos_fortes: { type: "array", items: { type: "string" } },
            melhorias: { type: "array", items: { type: "string" } }, proxima_mensagem: { type: "string" } } },
      });
    } catch (err) { console.warn("[analise] IA:", err.message); }
  }
  analise ||= analisarPorRegras(transcricao);
  return inserir("analises_conversa", { revendedora_id: revendedoraId, contato, canal, transcricao, analise_json: JSON.stringify(analise), criado_em: agora() });
}

function analisarPorRegras(t) {
  const x = t.toLowerCase();
  const objecoes = [];
  if (/(caro|sem dinheiro|apertad|depois)/.test(x)) objecoes.push("Preço/momento financeiro");
  if (/(n[aã]o conhe|nunca usei|ser[aá] que)/.test(x)) objecoes.push("Insegurança com o produto");
  if (/(demora|prazo|quando chega)/.test(x)) objecoes.push("Prazo de entrega");
  const positivo = (x.match(/(amei|lindo|quero|adoro|perfeito|obrigad)/g) || []).length;
  const negativo = (x.match(/(caro|n[aã]o gostei|demor|problema|reclam)/g) || []).length;
  return {
    resumo: "Análise automática por palavras-chave (ative a IA para uma análise completa).",
    sentimento: positivo > negativo ? "positivo" : negativo > positivo ? "negativo" : "neutro",
    probabilidade_compra: Math.max(5, Math.min(95, 50 + positivo * 10 - negativo * 10)),
    objecoes,
    oportunidades: ["Oferecer combo com hidratante para aumentar o ticket", "Perguntar a data de aniversário para campanhas"],
    pontos_fortes: positivo ? ["Cliente demonstrou interesse/elogio"] : [],
    melhorias: objecoes.includes("Preço/momento financeiro") ? ["Ofereça parcelamento ou tamanho menor"] : ["Feche com uma pergunta de escolha: 'Separo o de 75ml ou o de 100ml?'"],
    proxima_mensagem: "Oi! Fiquei pensando no que você me falou e separei uma opção que cabe certinho no que você procura 💛 Posso te mostrar?",
  };
}
