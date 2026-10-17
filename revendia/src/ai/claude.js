// Cliente da IA (Claude). Sem chave configurada, os agentes usam regras locais (modo offline).
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export const temIA = () => Boolean(config.claude.chave);
let cliente = null;
const api = () => (cliente ||= new Anthropic({ apiKey: config.claude.chave }));

// Parâmetros comuns: thinking adaptativo + fallback do servidor em caso de recusa.
function base(effort, maxTokens) {
  return {
    model: config.claude.modelo,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

const texto = (msg) => msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

// Resposta em JSON validada por schema (structured outputs)
export async function gerarJSON({ sistema, mensagem, schema, effort = "low", maxTokens = 16000 }) {
  const r = await api().beta.messages.create({
    ...base(effort, maxTokens),
    system: sistema,
    messages: [{ role: "user", content: mensagem }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });
  if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") throw new Error(`IA não concluiu (${r.stop_reason})`);
  return JSON.parse(texto(r));
}

// Loop de agente com ferramentas próprias. `executar(nome, input)` roda cada ferramenta.
export async function rodarAgente({ sistema, mensagens, ferramentas, executar, effort = "low", maxIteracoes = 8 }) {
  const msgs = [...mensagens];
  const acoes = [];
  for (let i = 0; i < maxIteracoes; i++) {
    const r = await api().beta.messages.create({ ...base(effort, 16000), system: sistema, tools: ferramentas, messages: msgs });
    msgs.push({ role: "assistant", content: r.content });
    if (r.stop_reason === "pause_turn") continue;
    if (r.stop_reason !== "tool_use") return { resposta: texto(r) || "Pronto!", acoes, mensagens: msgs };
    const resultados = [];
    for (const bloco of r.content.filter((b) => b.type === "tool_use")) {
      try {
        const saida = await executar(bloco.name, bloco.input || {});
        acoes.push({ ferramenta: bloco.name, entrada: bloco.input, saida });
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(saida ?? { ok: true }) });
      } catch (err) {
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: String(err.message || err), is_error: true });
      }
    }
    msgs.push({ role: "user", content: resultados });
  }
  return { resposta: "Fiz o que deu por agora — me pergunte de novo se faltou algo.", acoes, mensagens: msgs };
}
