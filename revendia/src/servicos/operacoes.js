// Agente de operações: onboarding de clientes, monitoramento de CS (saúde, NPS, pós-venda),
// suporte (tickets com resposta sugerida) e criticidade das operações (alertas P1–P4 com SLA).
import { um, todos, inserir, atualizar, registrarEvento } from "../db.js";
import { enviarTexto } from "../integracoes/whatsapp.js";
import { paraRevendedora } from "./notificacoes.js";
import { agora, somaDias, reais, dataBR } from "../util.js";

export const SLA_HORAS = { P1: 2, P2: 8, P3: 24, P4: 72 };
const ROTULO = { P1: "🔴 Crítico", P2: "🟠 Alto", P3: "🟡 Médio", P4: "🟢 Baixo" };

// ---------- Onboarding de clientes finais ----------
export async function onboardingCliente(revendedoraId, clienteId) {
  const cli = um("SELECT * FROM clientes WHERE id = ? AND revendedora_id = ?", clienteId, revendedoraId);
  if (!cli || cli.onboarding_status !== "pendente" || !cli.whatsapp) return;
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  await enviarTexto(cli.whatsapp,
    `Oi, ${cli.nome.split(" ")[0]}! Seja muito bem-vinda 💛 Aqui é a ${rev.nome.split(" ")[0]}.\n` +
    `Pra te atender cada vez melhor, me conta rapidinho:\n1️⃣ Prefere perfumes doces, florais ou amadeirados?\n2️⃣ Qual o dia do seu aniversário? (tem mimo 🎂)\n3️⃣ Seu endereço pra entrega por motoboy`,
    { revendedoraId, emNomeDaRevendedora: true });
  atualizar("clientes", cli.id, { onboarding_status: "enviado" });
}

// Interpreta a resposta do onboarding (preferência, aniversário, endereço)
export function registrarRespostaOnboarding(cliente, texto) {
  const prefs = JSON.parse(cliente.preferencias || "{}");
  const t = texto.toLowerCase();
  const familias = ["doce", "floral", "amadeirado", "cítrico", "citrico", "fresco"].filter((f) => t.includes(f));
  if (familias.length) prefs.familias = familias;
  const aniv = texto.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  const campos = { preferencias: JSON.stringify(prefs), onboarding_status: "concluido" };
  if (aniv) campos.aniversario = `2000-${aniv[2].padStart(2, "0")}-${aniv[1].padStart(2, "0")}`;
  const end = texto.match(/(rua|av\.?|avenida|travessa|alameda|estrada)[^\n]+/i);
  if (end && !cliente.endereco) campos.endereco = end[0].trim();
  atualizar("clientes", cliente.id, campos);
}

// ---------- CS: pós-venda, NPS e saúde da carteira ----------
export async function rodarPosVenda(revendedoraId) {
  let n = 0;
  // NPS 2 dias após a entrega
  for (const p of todos(`SELECT p.*, c.nome, c.whatsapp FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.revendedora_id = ? AND p.status = 'entregue' AND p.atualizado_em <= ? AND c.whatsapp IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mensagens m WHERE m.contato = c.whatsapp AND m.texto LIKE '%de 0 a 10%' AND m.criado_em >= p.atualizado_em)`,
    revendedoraId, somaDias(new Date(), -2).toISOString())) {
    await enviarTexto(p.whatsapp, `Oi, ${p.nome.split(" ")[0]}! Gostou dos produtos? 💛 De 0 a 10, quanto você me indicaria pra uma amiga?`, { revendedoraId, emNomeDaRevendedora: true });
    n++;
  }
  // Recompra: produtos que acabam (~45 dias para hidratante, ~90 para perfume)
  for (const i of todos(`SELECT i.nome, c.nome AS cliente, c.whatsapp, p.criado_em FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id JOIN clientes c ON c.id = p.cliente_id
      JOIN produtos pr ON pr.id = i.produto_id WHERE p.revendedora_id = ? AND p.status = 'entregue' AND c.whatsapp IS NOT NULL
      AND ((pr.categoria LIKE '%Corpo%' AND date(p.criado_em) = date(?)) OR (pr.categoria LIKE '%Perfum%' AND date(p.criado_em) = date(?)))`,
    revendedoraId, somaDias(new Date(), -45).toISOString(), somaDias(new Date(), -90).toISOString())) {
    await enviarTexto(i.whatsapp, `${i.cliente.split(" ")[0]}, seu ${i.nome} já deve estar acabando 😉 Quer que eu já separe outro?`, { revendedoraId, emNomeDaRevendedora: true });
    n++;
  }
  return n;
}

export function registrarNps(revendedoraId, cliente, nota) {
  atualizar("clientes", cliente.id, { nps: nota });
  if (nota <= 6) {
    abrirTicket(revendedoraId, { clienteId: cliente.id, origem: "nps", categoria: "insatisfacao", assunto: `NPS ${nota} de ${cliente.nome}`,
      descricao: "Cliente detratora — ligar e entender o que aconteceu.", criticidade: "P2" });
  }
}

export function saudeCarteira(revendedoraId) {
  const clientes = todos(`SELECT c.*, MAX(p.criado_em) AS ultima_compra, COUNT(p.id) AS compras, COALESCE(SUM(p.total),0) AS total_gasto
    FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status != 'cancelado' WHERE c.revendedora_id = ? GROUP BY c.id`, revendedoraId);
  const hoje = Date.now();
  const lista = clientes.map((c) => {
    const dias = c.ultima_compra ? Math.floor((hoje - new Date(c.ultima_compra)) / 86400000) : null;
    const saude = dias === null ? "nova" : dias <= 30 ? "ativa" : dias <= 60 ? "em_risco" : "inativa";
    return { id: c.id, nome: c.nome, whatsapp: c.whatsapp, compras: c.compras, total_gasto: c.total_gasto, dias_sem_comprar: dias, nps: c.nps, saude };
  });
  const promotores = lista.filter((c) => c.nps >= 9).length, detratores = lista.filter((c) => c.nps !== null && c.nps <= 6).length;
  const respondentes = lista.filter((c) => c.nps !== null).length;
  return {
    clientes: lista.sort((a, b) => b.total_gasto - a.total_gasto),
    resumo: {
      ativas: lista.filter((c) => c.saude === "ativa").length, em_risco: lista.filter((c) => c.saude === "em_risco").length,
      inativas: lista.filter((c) => c.saude === "inativa").length, nps: respondentes ? Math.round(((promotores - detratores) / respondentes) * 100) : null,
    },
  };
}

// ---------- Suporte (tickets) ----------
export function abrirTicket(revendedoraId, { clienteId = null, pedidoId = null, origem = "whatsapp", categoria = "outro", assunto, descricao = "", criticidade = "P3", resposta = "" }) {
  const aberto = um("SELECT * FROM tickets WHERE revendedora_id = ? AND assunto = ? AND status != 'resolvido'", revendedoraId, assunto);
  if (aberto) return aberto;
  const t = inserir("tickets", { revendedora_id: revendedoraId, cliente_id: clienteId, pedido_id: pedidoId, origem, categoria, assunto, descricao,
    criticidade, status: "aberto", resposta, sla_ate: new Date(Date.now() + SLA_HORAS[criticidade] * 3600000).toISOString(), criado_em: agora() });
  registrarEvento(revendedoraId, "suporte", `${ROTULO[criticidade]} ${assunto}`);
  return t;
}

export function resolverTicket(revendedoraId, ticketId, resposta) {
  const t = um("SELECT * FROM tickets WHERE id = ? AND revendedora_id = ?", ticketId, revendedoraId);
  if (!t) throw new Error("Ticket não encontrado");
  atualizar("tickets", t.id, { status: "resolvido", resposta: resposta || t.resposta, resolvido_em: agora() });
}

// ---------- Criticidade das operações ----------
// Varre a operação e abre/atualiza alertas: boletos vencendo, pedidos parados, entregas atrasadas, cobranças vencidas, SLA estourado.
export async function monitorarOperacao(revendedoraId) {
  const hoje = new Date();
  const alertas = [];
  for (const b of todos("SELECT * FROM boletos WHERE revendedora_id = ? AND status = 'aberto'", revendedoraId)) {
    const horas = (new Date(b.vencimento) - hoje) / 3600000;
    if (horas < 0) alertas.push({ criticidade: "P1", categoria: "boleto", assunto: `Boleto vencido ${reais(b.valor)} (${b.fornecedor})`, descricao: "Pedido travado na marca até o pagamento. Pague hoje para não atrasar as clientes." });
    else if (horas < 24) alertas.push({ criticidade: "P2", categoria: "boleto", assunto: `Boleto vence hoje ${reais(b.valor)} (${b.fornecedor})`, descricao: "Pague para a marca liberar o pedido." });
  }
  for (const p of todos(`SELECT p.*, c.nome FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.revendedora_id = ?
      AND p.status NOT IN ('entregue','cancelado') AND p.previsao_entrega IS NOT NULL AND p.previsao_entrega < ?`, revendedoraId, somaDias(hoje, -1).toISOString())) {
    alertas.push({ criticidade: "P1", categoria: "atraso", pedidoId: p.id, clienteId: p.cliente_id, assunto: `Entrega atrasada: ${p.nome}`, descricao: `Previsto para ${dataBR(p.previsao_entrega)}. Avise a cliente e verifique com a marca.` });
  }
  for (const l of todos("SELECT * FROM lotes WHERE revendedora_id = ? AND status = 'aberto' AND criado_em < ?", revendedoraId, somaDias(hoje, -2).toISOString())) {
    alertas.push({ criticidade: "P3", categoria: "pedido_minimo", assunto: `Pedido ${l.fornecedor} abaixo do mínimo há 2+ dias`, descricao: `Total atual ${reais(l.total_custo)}. Vou sugerir um combo para completar ou envie assim mesmo.` });
  }
  for (const c of todos(`SELECT co.*, cl.nome FROM cobrancas co JOIN clientes cl ON cl.id = co.cliente_id WHERE co.revendedora_id = ? AND co.status = 'aberta' AND co.lembretes >= 3`, revendedoraId)) {
    alertas.push({ criticidade: "P2", categoria: "inadimplencia", clienteId: c.cliente_id, assunto: `Cobrança em atraso: ${c.nome} (${reais(c.valor)})`, descricao: "Já enviei 3 lembretes. Sugiro uma ligação." });
  }
  for (const e of todos("SELECT * FROM entregas WHERE revendedora_id = ? AND status IN ('procurando_motoboy','motoboy_designado') AND criado_em < ?", revendedoraId, new Date(Date.now() - 45 * 60000).toISOString())) {
    alertas.push({ criticidade: "P2", categoria: "motoboy", pedidoId: e.pedido_id, assunto: `Motoboy não coletou em 45 min`, descricao: "Vou tentar outro motoboy automaticamente." });
  }
  let novos = 0;
  for (const a of alertas) {
    const antes = um("SELECT id FROM tickets WHERE revendedora_id = ? AND assunto = ? AND status != 'resolvido'", revendedoraId, a.assunto);
    const t = abrirTicket(revendedoraId, { ...a, origem: "monitoramento" });
    if (!antes) {
      novos++;
      if (a.criticidade === "P1") await paraRevendedora(revendedoraId, `🔴 Atenção: ${t.assunto}\n${t.descricao}`);
    }
  }
  // SLA estourado sobe um nível
  for (const t of todos("SELECT * FROM tickets WHERE revendedora_id = ? AND status = 'aberto' AND sla_ate < ? AND criticidade != 'P1'", revendedoraId, agora())) {
    const nova = { P4: "P3", P3: "P2", P2: "P1" }[t.criticidade];
    atualizar("tickets", t.id, { criticidade: nova, sla_ate: new Date(Date.now() + SLA_HORAS[nova] * 3600000).toISOString() });
  }
  return novos;
}

export const listarTickets = (revendedoraId) =>
  todos(`SELECT t.*, c.nome AS cliente_nome FROM tickets t LEFT JOIN clientes c ON c.id = t.cliente_id WHERE t.revendedora_id = ?
    ORDER BY CASE t.status WHEN 'resolvido' THEN 1 ELSE 0 END, t.criticidade, t.criado_em DESC LIMIT 100`, revendedoraId);
