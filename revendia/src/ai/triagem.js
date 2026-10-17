// Agente de triagem: lê cada mensagem que chega no WhatsApp da revendedora e decide o que é —
// pedido, lead/interesse, suporte/reclamação, pagamento ou conversa — e extrai os dados.
import { temIA, gerarJSON } from "./claude.js";
import { listar, buscarAproximado } from "../servicos/catalogo.js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intencao", "itens", "nome_cliente", "endereco", "interesse", "score_lead", "criticidade", "categoria_suporte", "resposta"],
  properties: {
    intencao: { type: "string", enum: ["pedido", "lead", "suporte", "pagamento", "outro"] },
    itens: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["produto_id", "qtd"],
        properties: { produto_id: { type: "string" }, qtd: { type: "integer" } },
      },
    },
    nome_cliente: { type: "string" },
    endereco: { type: "string" },
    interesse: { type: "string", description: "o que a pessoa procura (para leads)" },
    score_lead: { type: "integer", description: "0-100: chance de compra" },
    criticidade: { type: "string", enum: ["P1", "P2", "P3", "P4"], description: "para suporte: P1 crítico ... P4 dúvida simples" },
    categoria_suporte: { type: "string", enum: ["atraso", "troca", "produto_avariado", "duvida", "cobranca", "outro"] },
    resposta: { type: "string", description: "resposta curta e calorosa, no tom da revendedora, para enviar ao contato" },
  },
};

export async function triar({ revendedora, texto, contato, historico = [] }) {
  const catalogo = listar(revendedora.id);
  if (temIA()) {
    try {
      const lista = catalogo.map((p) => `${p.id} | ${p.nome} | R$ ${p.preco_catalogo} | estoque ${p.estoque}`).join("\n");
      return await gerarJSON({
        sistema:
          `Você é a assistente comercial da revendedora de cosméticos ${revendedora.nome}. Classifique a mensagem do cliente e extraia dados. ` +
          `Para pedidos, mapeie cada produto citado para um produto_id do catálogo (escolha o mais provável; quantidade padrão 1). ` +
          `Se a pessoa só pergunta preço/indicação, é "lead". Reclamação de atraso, troca, defeito = "suporte" (P1 se produto errado/avariado ou atraso > 7 dias, P2 atraso, P3 troca, P4 dúvida). ` +
          `Comprovante/"já paguei" = "pagamento". A resposta deve soar humana, em português do Brasil, com no máximo 3 frases, sem inventar preços fora do catálogo.\n\nCATÁLOGO (id | nome | preço | estoque):\n${lista}`,
        mensagem: `Contato: ${contato.nome || "desconhecido"} (${contato.whatsapp})\nHistórico recente:\n${historico.join("\n") || "(nenhum)"}\n\nMensagem nova:\n${texto}`,
        schema: SCHEMA,
      });
    } catch (err) {
      console.warn("[triagem] IA indisponível, usando regras:", err.message);
    }
  }
  return triarPorRegras(revendedora, texto, contato);
}

// Regras locais (sem IA): palavras-chave + busca aproximada no catálogo
export function triarPorRegras(revendedora, texto, contato) {
  const t = texto.toLowerCase();
  const endereco = (texto.match(/\b(rua|r\.|av\.?|avenida|travessa|alameda|estrada|praça)\s[^\n]+/i) || [""])[0].trim();
  const base = { itens: [], nome_cliente: contato.nome || "", endereco, interesse: "", score_lead: 0, criticidade: "P4", categoria_suporte: "outro", resposta: "" };
  if (/(atras|cad[eê]|n[aã]o chegou|demor|errad|quebrad|vazand|troca|defeito)/.test(t)) {
    const p1 = /(errad|quebrad|vazand|defeito)/.test(t);
    return { ...base, intencao: "suporte", criticidade: p1 ? "P1" : /troca/.test(t) ? "P3" : "P2",
      categoria_suporte: p1 ? "produto_avariado" : /troca/.test(t) ? "troca" : "atraso",
      resposta: "Oi! Sinto muito por isso 💛 Já estou verificando agora e te dou um retorno em instantes." };
  }
  if (/(paguei|comprovante|pix feito|transferi)/.test(t)) return { ...base, intencao: "pagamento", resposta: "Recebido, obrigada! Vou confirmar aqui 💛" };
  const pedir = /(quero|manda|separa|reserva|vou levar|me v[eê]|encomend|pedido)/.test(t);
  const trechos = (endereco ? t.replace(endereco.toLowerCase(), "") : t).split(/,|\be\b|\n|\+/).map((s) => s.trim()).filter(Boolean);
  const itens = [];
  for (const tr of trechos) {
    const p = buscarAproximado(revendedora.id, tr);
    if (p && !itens.find((i) => i.produto_id === p.id)) itens.push({ produto_id: p.id, qtd: Number(tr.match(/\b(\d{1,2})\b/)?.[1] || 1) });
  }
  if (pedir && itens.length) return { ...base, intencao: "pedido", itens, resposta: "Anotadinho! 💛 Já vou te mandar o resumo e o Pix." };
  if (itens.length || /(pre[cç]o|quanto|tem |valor|promo|indica)/.test(t)) {
    return { ...base, intencao: "lead", interesse: texto.slice(0, 120), score_lead: itens.length ? 70 : 45,
      resposta: "Oi! Tenho sim 😍 Quer que eu te mande as opções e a promoção do ciclo?" };
  }
  return { ...base, intencao: "outro", resposta: "" };
}
