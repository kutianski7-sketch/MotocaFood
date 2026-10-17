// Agente financeiro/administrativo: cobrança das clientes, conciliação bancária, fluxo de caixa, DRE e relatórios.
// Regra de ouro: a IA nunca move dinheiro. Pagar, transferir e mexer em conta bancária são ações manuais da revendedora.
import { um, todos, inserir, atualizar, exec, registrarEvento } from "../db.js";
import { enviarTexto } from "../integracoes/whatsapp.js";
import { temIA, gerarJSON } from "../ai/claude.js";
import { agora, centavos, somaDias, reais, pixCopiaECola, dataLocal } from "../util.js";

// ---------------- Cobrança das clientes ----------------
export function criarCobranca(rev, pedido, cli) {
  if (!pedido.total) return null;
  const pix = rev.chave_pix
    ? pixCopiaECola({ chave: rev.chave_pix, nome: rev.nome, cidade: rev.cidade || "BRASIL", valor: pedido.total, txid: `RV${pedido.id.slice(-10)}` })
    : null;
  return inserir("cobrancas", { revendedora_id: rev.id, cliente_id: cli.id, pedido_id: pedido.id, valor: pedido.total,
    vencimento: somaDias(new Date(), 2).toISOString().slice(0, 10), status: "aberta", pix_copia_cola: pix, criado_em: agora() });
}

export async function cobrancaPaga(cobrancaId, forma = "manual") {
  const c = um("SELECT * FROM cobrancas WHERE id = ?", cobrancaId);
  if (!c || c.status === "paga") return;
  atualizar("cobrancas", c.id, { status: "paga", pago_em: agora() });
  exec("UPDATE pedidos SET pago_pelo_cliente = 1 WHERE id = ?", c.pedido_id);
  exec("UPDATE lancamentos SET status = 'realizado', data = ? WHERE pedido_id = ? AND tipo = 'receita'", agora().slice(0, 10), c.pedido_id);
  registrarEvento(c.revendedora_id, "cobranca", `Recebido ${reais(c.valor)} (${forma})`);
}

// Cadência de cobrança gentil: D+0 (junto do pedido), D+2, D+5, D+10. Depois disso vira alerta P2 em Operações.
const CADENCIA_DIAS = [2, 5, 10];
export async function rodarCobrancas(revendedoraId) {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  let enviados = 0;
  for (const c of todos("SELECT c.*, cl.nome, cl.whatsapp FROM cobrancas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.revendedora_id = ? AND c.status = 'aberta'", revendedoraId)) {
    const dias = (Date.now() - new Date(c.criado_em).getTime()) / 86400000;
    const proximo = CADENCIA_DIAS[c.lembretes];
    if (proximo === undefined || dias < proximo || !c.whatsapp) continue;
    const nome = c.nome.split(" ")[0];
    const textos = [
      `Oi, ${nome}! Passando só pra lembrar do Pix de ${reais(c.valor)} do seu pedido 💛${c.pix_copia_cola ? `\n${c.pix_copia_cola}` : ""}`,
      `${nome}, tudo bem? Seu pedido de ${reais(c.valor)} ainda está em aberto por aqui. Se já pagou, me manda o comprovante? 😊`,
      `${nome}, preciso fechar meu caixa do ciclo 🙏 Consegue acertar os ${reais(c.valor)} até amanhã? Se quiser, divido em 2x.`,
    ];
    await enviarTexto(c.whatsapp, textos[c.lembretes], { revendedoraId, emNomeDaRevendedora: true });
    atualizar("cobrancas", c.id, { lembretes: c.lembretes + 1, ultimo_lembrete_em: agora() });
    enviados++;
  }
  if (enviados) registrarEvento(rev.id, "cobranca", `${enviados} lembrete(s) de pagamento enviados`);
  return enviados;
}

// ---------------- Conciliação bancária ----------------
// Aceita CSV (data;descrição;valor) ou OFX exportado do app do banco.
export function lerExtrato(texto) {
  const linhas = [];
  if (/<OFX>/i.test(texto)) {
    for (const bloco of texto.split(/<STMTTRN>/i).slice(1)) {
      const tag = (t) => (bloco.match(new RegExp(`<${t}>([^<\\r\\n]+)`, "i")) || [])[1]?.trim();
      const d = tag("DTPOSTED") || "";
      linhas.push({ data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, descricao: tag("MEMO") || tag("NAME") || "", valor: Number(tag("TRNAMT")), documento: tag("FITID") || "" });
    }
    return linhas;
  }
  for (const l of texto.split(/\r?\n/)) {
    const c = l.split(/;|\t/);
    if (c.length < 3) continue;
    const m = c[0].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const data = m ? `${m[3]}-${m[2]}-${m[1]}` : c[0].trim();
    const valor = Number(c[2].replace("R$", "").replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(valor)) continue;
    linhas.push({ data, descricao: c[1].trim(), valor, documento: (c[3] || "").trim() });
  }
  return linhas;
}

export async function importarExtrato(revendedoraId, texto) {
  let novos = 0;
  for (const l of lerExtrato(texto)) {
    const r = exec(`INSERT OR IGNORE INTO extrato (id, revendedora_id, data, descricao, valor, documento, status, criado_em) VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)`,
      `ex_${Math.random().toString(36).slice(2)}`, revendedoraId, l.data, l.descricao, l.valor, l.documento, agora());
    novos += r.changes;
  }
  const conc = await conciliar(revendedoraId);
  return { importados: novos, ...conc };
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export async function conciliar(revendedoraId) {
  const { boletoPago } = await import("./pedidos.js");
  let conciliados = 0;
  for (const e of todos("SELECT * FROM extrato WHERE revendedora_id = ? AND status = 'pendente'", revendedoraId)) {
    const perto = (v) => Math.abs(Math.abs(e.valor) - v) < 0.05;
    if (e.valor > 0) {
      // Crédito: Pix de cliente -> cobrança aberta de mesmo valor (preferindo nome parecido)
      const abertas = todos("SELECT c.*, cl.nome FROM cobrancas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.revendedora_id = ? AND c.status = 'aberta'", revendedoraId).filter((c) => perto(c.valor));
      const alvo = abertas.find((c) => norm(e.descricao).includes(norm(c.nome).split(" ")[0])) || (abertas.length === 1 ? abertas[0] : null);
      if (alvo) {
        await cobrancaPaga(alvo.id, "conciliação bancária");
        atualizar("extrato", e.id, { status: "conciliado", conciliado_tipo: "cobranca", conciliado_id: alvo.id });
        conciliados++;
      }
    } else {
      // Débito: boleto da marca em aberto de mesmo valor
      const b = todos("SELECT * FROM boletos WHERE revendedora_id = ? AND status != 'pago'", revendedoraId).find((x) => perto(x.valor));
      if (b) {
        await boletoPago(b.id, "conciliação bancária");
        atualizar("extrato", e.id, { status: "conciliado", conciliado_tipo: "boleto", conciliado_id: b.id });
        conciliados++;
        continue;
      }
      const l = todos("SELECT * FROM lancamentos WHERE revendedora_id = ? AND tipo IN ('despesa','custo') AND status = 'previsto'", revendedoraId).find((x) => perto(x.valor));
      if (l) {
        atualizar("lancamentos", l.id, { status: "realizado", data: e.data });
        atualizar("extrato", e.id, { status: "conciliado", conciliado_tipo: "lancamento", conciliado_id: l.id });
        conciliados++;
      }
    }
  }
  const pendentes = um("SELECT COUNT(*) AS n FROM extrato WHERE revendedora_id = ? AND status = 'pendente'", revendedoraId).n;
  if (conciliados) registrarEvento(revendedoraId, "conciliacao", `${conciliados} movimentação(ões) conciliadas automaticamente`);
  return { conciliados, pendentes };
}

// Classifica manualmente uma linha do extrato (ex.: "Embalagens") criando o lançamento correspondente
export function classificarExtrato(revendedoraId, extratoId, categoria) {
  const e = um("SELECT * FROM extrato WHERE id = ? AND revendedora_id = ?", extratoId, revendedoraId);
  if (!e) throw new Error("Movimentação não encontrada");
  const l = inserir("lancamentos", { revendedora_id: revendedoraId, tipo: e.valor > 0 ? "receita" : "despesa", categoria, descricao: e.descricao, valor: Math.abs(e.valor), data: e.data, status: "realizado" });
  atualizar("extrato", e.id, { status: "conciliado", conciliado_tipo: "lancamento", conciliado_id: l.id });
}

// ---------------- Fluxo de caixa ----------------
export function fluxoCaixa(revendedoraId, dias = 30) {
  const hoje = dataLocal();
  const fim = dataLocal(somaDias(new Date(), dias));
  const sinal = (l) => (l.tipo === "receita" ? 1 : -1) * l.valor;
  const saldoAtual = centavos(todos("SELECT * FROM lancamentos WHERE revendedora_id = ? AND status = 'realizado'", revendedoraId).reduce((s, l) => s + sinal(l), 0));
  const previstos = todos("SELECT * FROM lancamentos WHERE revendedora_id = ? AND status = 'previsto' AND data <= ? ORDER BY data", revendedoraId, fim);
  const porDia = new Map();
  for (const l of previstos) {
    const d = l.data < hoje ? hoje : l.data; // vencidos entram hoje
    const x = porDia.get(d) || { data: d, entradas: 0, saidas: 0 };
    if (l.tipo === "receita") x.entradas += l.valor; else x.saidas += l.valor;
    porDia.set(d, x);
  }
  let saldo = saldoAtual;
  const serie = [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)).map((x) => {
    saldo += x.entradas - x.saidas;
    return { ...x, entradas: centavos(x.entradas), saidas: centavos(x.saidas), saldo: centavos(saldo) };
  });
  const menor = serie.reduce((m, x) => (x.saldo < m.saldo ? x : m), { saldo: saldoAtual, data: hoje });
  return {
    saldoAtual, saldoProjetado: centavos(saldo), serie,
    alerta: menor.saldo < 0 ? `Atenção: o caixa pode ficar negativo em ${menor.data} (${reais(menor.saldo)}). Vou intensificar a cobrança das clientes.` : null,
  };
}

// ---------------- DRE ----------------
export function dre(revendedoraId, mes) {
  const pedidos = todos("SELECT * FROM pedidos WHERE revendedora_id = ? AND status != 'cancelado' AND substr(criado_em,1,7) = ?", revendedoraId, mes);
  const receitaBruta = centavos(pedidos.reduce((s, p) => s + p.total, 0));
  const descontos = centavos(todos("SELECT i.* FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id WHERE p.revendedora_id = ? AND p.status != 'cancelado' AND substr(p.criado_em,1,7) = ?", revendedoraId, mes)
    .reduce((s, i) => s + Math.max(0, (um("SELECT preco_catalogo FROM produtos WHERE id = ?", i.produto_id)?.preco_catalogo || i.preco_unit) - i.preco_unit) * i.qtd, 0));
  const cmv = centavos(pedidos.reduce((s, p) => s + p.custo, 0));
  const despesas = todos("SELECT categoria, SUM(valor) AS v FROM lancamentos WHERE revendedora_id = ? AND tipo = 'despesa' AND substr(data,1,7) = ? GROUP BY categoria", revendedoraId, mes)
    .map((d) => ({ categoria: d.categoria, valor: centavos(d.v) }));
  const totalDespesas = centavos(despesas.reduce((s, d) => s + d.valor, 0));
  const lucroBruto = centavos(receitaBruta - cmv);
  const lucroLiquido = centavos(lucroBruto - totalDespesas);
  return {
    mes, pedidos: pedidos.length, receitaBruta, descontos, receitaLiquida: receitaBruta, cmv, lucroBruto,
    despesas, totalDespesas, lucroLiquido,
    margemBruta: receitaBruta ? Math.round((lucroBruto / receitaBruta) * 1000) / 10 : 0,
    margemLiquida: receitaBruta ? Math.round((lucroLiquido / receitaBruta) * 1000) / 10 : 0,
    ticketMedio: pedidos.length ? centavos(receitaBruta / pedidos.length) : 0,
  };
}

export function serieMensal(revendedoraId, meses = 6) {
  const lista = [];
  const d = new Date();
  for (let i = meses - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const mes = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
    const r = dre(revendedoraId, mes);
    lista.push({ mes, receita: r.receitaBruta, lucro: r.lucroLiquido, pedidos: r.pedidos });
  }
  return lista;
}

export function maisVendidos(revendedoraId, dias = 90, limite = 5) {
  const desde = somaDias(new Date(), -dias).toISOString();
  return todos(`SELECT i.produto_id, i.nome, SUM(i.qtd) AS qtd, SUM(i.qtd*i.preco_unit) AS receita, SUM(i.qtd*(i.preco_unit-i.custo_unit)) AS lucro
    FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id WHERE p.revendedora_id = ? AND p.criado_em >= ? AND p.status != 'cancelado'
    GROUP BY i.produto_id ORDER BY qtd DESC LIMIT ?`, revendedoraId, desde, limite);
}

// ---------------- Relatório mensal (com análise da IA) ----------------
export async function relatorioMensal(revendedoraId, mes) {
  const atual = dre(revendedoraId, mes);
  const [a, m] = mes.split("-").map(Number);
  const mesAnt = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const anterior = dre(revendedoraId, mesAnt);
  const top = maisVendidos(revendedoraId, 31);
  const crescimento = anterior.receitaBruta ? Math.round(((atual.receitaBruta - anterior.receitaBruta) / anterior.receitaBruta) * 1000) / 10 : null;
  const dados = { atual, anterior, crescimento, top };
  let analise = null;
  if (temIA()) {
    try {
      analise = await gerarJSON({
        sistema: "Você é a consultora financeira de uma revendedora de cosméticos. Escreva em português simples, tom encorajador, sem jargão. Use apenas os números fornecidos.",
        mensagem: `Dados do mês ${mes} (JSON):\n${JSON.stringify(dados)}`,
        schema: { type: "object", additionalProperties: false, required: ["resumo", "destaques", "acoes"], properties: {
          resumo: { type: "string" }, destaques: { type: "array", items: { type: "string" } }, acoes: { type: "array", items: { type: "string" } } } },
      });
    } catch (err) { console.warn("[relatorio] IA:", err.message); }
  }
  analise ||= {
    resumo: `Em ${mes} você vendeu ${reais(atual.receitaBruta)} em ${atual.pedidos} pedidos e lucrou ${reais(atual.lucroLiquido)} (margem de ${atual.margemLiquida}%).` +
      (crescimento !== null ? ` Isso é ${crescimento >= 0 ? "+" : ""}${crescimento}% em relação ao mês anterior.` : ""),
    destaques: top.slice(0, 3).map((t) => `${t.nome}: ${t.qtd} vendidos`),
    acoes: [
      atual.ticketMedio < 120 ? "Ticket médio baixo: vou oferecer combos (perfume + hidratante) nas próximas conversas." : "Ticket médio saudável: vamos manter os combos premium.",
      "Reativar clientes que não compram há 45 dias com uma oferta exclusiva.",
      "Postar 4x por semana os campeões de venda no Instagram.",
    ],
  };
  exec(`INSERT INTO relatorios (id, revendedora_id, mes, dados_json, analise, criado_em) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(revendedora_id, mes) DO UPDATE SET dados_json = excluded.dados_json, analise = excluded.analise, criado_em = excluded.criado_em`,
    `rel_${revendedoraId}_${mes}`, revendedoraId, mes, JSON.stringify(dados), JSON.stringify(analise), agora());
  return { mes, ...dados, analise };
}
