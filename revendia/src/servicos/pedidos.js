// Agente operacional: pedido -> consolidação no pedido mínimo da marca -> boleto -> pagamento identificado
// -> chegada na revendedora -> motoboy -> entrega. A revendedora só paga o boleto e entrega a sacola ao motoboy.
import { um, todos, inserir, atualizar, transacao, registrarEvento, configDe } from "../db.js";
import { conector, infoMarca } from "../integracoes/fornecedores/index.js";
import * as motoboy from "../integracoes/motoboy.js";
import { paraCliente, paraRevendedora } from "./notificacoes.js";
import { criarCobranca } from "./financeiro.js";
import { agora, centavos, somaDias, decifra, reais, dataBR, normalizaWhatsapp } from "../util.js";

const HORAS_MAX_LOTE = Number(process.env.HORAS_MAX_LOTE || 24); // envia o lote mesmo abaixo do mínimo após X horas

export function obterOuCriarCliente(revendedoraId, { nome, whatsapp, endereco }) {
  const w = normalizaWhatsapp(whatsapp) || whatsapp || null;
  let cli = w ? um("SELECT * FROM clientes WHERE revendedora_id = ? AND whatsapp = ?", revendedoraId, w) : null;
  if (!cli) {
    cli = inserir("clientes", { revendedora_id: revendedoraId, nome: nome || "Cliente", whatsapp: w, endereco: endereco || null, criado_em: agora() });
  } else if ((endereco && !cli.endereco) || (nome && cli.nome === "Cliente")) {
    atualizar("clientes", cli.id, { endereco: cli.endereco || endereco, nome: cli.nome === "Cliente" ? nome : cli.nome });
  }
  return um("SELECT * FROM clientes WHERE id = ?", cli.id);
}

export async function criarPedido(revendedoraId, { cliente, itens, origem = "manual", mensagem = "", observacao = "" }) {
  if (!itens?.length) throw new Error("Pedido sem itens");
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  const cli = obterOuCriarCliente(revendedoraId, cliente);
  const pedido = transacao(() => {
    const p = inserir("pedidos", { revendedora_id: revendedoraId, cliente_id: cli.id, status: "novo", origem, mensagem_original: mensagem, observacao, criado_em: agora(), atualizado_em: agora() });
    let total = 0, custo = 0, todosEmEstoque = true;
    for (const it of itens) {
      const prod = um("SELECT * FROM produtos WHERE id = ? AND revendedora_id = ?", it.produto_id, revendedoraId);
      if (!prod) throw new Error(`Produto não encontrado: ${it.produto_id}`);
      const qtd = Math.max(1, Number(it.qtd) || 1);
      const deEstoque = prod.estoque >= qtd ? 1 : 0;
      if (deEstoque) atualizar("produtos", prod.id, { estoque: prod.estoque - qtd });
      else todosEmEstoque = false;
      const preco = it.preco_unit ?? prod.preco_catalogo;
      inserir("itens_pedido", { pedido_id: p.id, produto_id: prod.id, fornecedor: prod.fornecedor, sku: prod.sku, nome: prod.nome, qtd, preco_unit: preco, custo_unit: prod.preco_custo, de_estoque: deEstoque });
      total += preco * qtd;
      custo += prod.preco_custo * qtd;
    }
    const status = todosEmEstoque ? "pronto_para_entrega" : "aguardando_lote";
    atualizar("pedidos", p.id, { total: centavos(total), custo: centavos(custo), status, previsao_entrega: todosEmEstoque ? somaDias(new Date(), 0).toISOString() : null });
    inserir("lancamentos", { revendedora_id: revendedoraId, tipo: "receita", categoria: "Vendas", descricao: `Venda para ${cli.nome}`, valor: centavos(total), data: agora().slice(0, 10), pedido_id: p.id, status: "previsto" });
    return um("SELECT * FROM pedidos WHERE id = ?", p.id);
  });

  const resumo = todos("SELECT nome, qtd FROM itens_pedido WHERE pedido_id = ?", pedido.id).map((i) => `${i.qtd}x ${i.nome}`).join(", ");
  const cobranca = criarCobranca(rev, pedido, cli);
  await paraCliente(pedido, "confirmado", { resumo, pix: cobranca?.pix_copia_cola });
  registrarEvento(revendedoraId, "pedido", `Novo pedido de ${cli.nome}: ${resumo} (${reais(pedido.total)})`);

  // Itens que precisam vir da marca entram no lote aberto de cada fornecedor
  for (const forn of todos("SELECT DISTINCT fornecedor FROM itens_pedido WHERE pedido_id = ? AND de_estoque = 0", pedido.id)) {
    const lote = loteAberto(revendedoraId, forn.fornecedor);
    transacao(() => {
      for (const it of todos("SELECT * FROM itens_pedido WHERE pedido_id = ? AND de_estoque = 0 AND fornecedor = ?", pedido.id, forn.fornecedor)) {
        atualizar("itens_pedido", it.id, { lote_id: lote.id });
      }
      const tot = um("SELECT COALESCE(SUM(custo_unit*qtd),0) AS v FROM itens_pedido WHERE lote_id = ?", lote.id).v;
      atualizar("lotes", lote.id, { total_custo: centavos(tot), atualizado_em: agora() });
    });
    await tentarEnviarLote(lote.id);
  }
  if (pedido.status === "pronto_para_entrega") await prontoParaEntrega(pedido.id);
  return um("SELECT * FROM pedidos WHERE id = ?", pedido.id);
}

function loteAberto(revendedoraId, fornecedor) {
  return um("SELECT * FROM lotes WHERE revendedora_id = ? AND fornecedor = ? AND status = 'aberto'", revendedoraId, fornecedor)
    || inserir("lotes", { revendedora_id: revendedoraId, fornecedor, status: "aberto", total_custo: 0, criado_em: agora(), atualizado_em: agora() });
}

// Envia o lote quando bate o pedido mínimo da marca (ou quando passa do tempo máximo de espera)
export async function tentarEnviarLote(loteId, { forcar = false } = {}) {
  const lote = um("SELECT * FROM lotes WHERE id = ?", loteId);
  if (!lote || lote.status !== "aberto") return null;
  const minimo = infoMarca(lote.fornecedor).minimoPedido;
  const horas = (Date.now() - new Date(lote.criado_em).getTime()) / 3600000;
  const integ = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'fornecedor' AND provedor = ? AND status = 'conectado'", lote.revendedora_id, lote.fornecedor);
  if (!integ) return null; // catálogo manual: a revendedora compra por fora; seguimos o pedido pelo status manual
  if (!forcar && lote.total_custo < minimo && horas < HORAS_MAX_LOTE) return null;

  const itens = todos(`SELECT sku, nome, SUM(qtd) AS qtd, custo_unit FROM itens_pedido WHERE lote_id = ? GROUP BY sku`, loteId);
  const r = await conector(lote.fornecedor).enviarPedido(decifra(integ.credenciais), itens);
  transacao(() => {
    atualizar("lotes", loteId, { status: "aguardando_pagamento", pedido_fornecedor_id: r.pedidoId, previsao_chegada: r.previsaoChegada, enviado_em: agora(), atualizado_em: agora() });
    const b = inserir("boletos", { revendedora_id: lote.revendedora_id, lote_id: loteId, fornecedor: lote.fornecedor, valor: r.boleto.valor, vencimento: r.boleto.vencimento,
      linha_digitavel: r.boleto.linhaDigitavel, pix_copia_cola: r.boleto.pixCopiaECola, status: "aberto", criado_em: agora() });
    inserir("lancamentos", { revendedora_id: lote.revendedora_id, tipo: "custo", categoria: "Compra de mercadoria", descricao: `Pedido ${infoMarca(lote.fornecedor).nome} ${r.pedidoId}`,
      valor: r.boleto.valor, data: r.boleto.vencimento.slice(0, 10), boleto_id: b.id, status: "previsto" });
    for (const p of pedidosDoLote(loteId)) atualizar("pedidos", p.id, { status: "aguardando_pagamento", atualizado_em: agora() });
  });
  registrarEvento(lote.revendedora_id, "lote", `Pedido enviado à ${infoMarca(lote.fornecedor).nome} (${r.pedidoId}). Boleto de ${reais(r.boleto.valor)} vence ${dataBR(r.boleto.vencimento)}.`);
  await paraRevendedora(lote.revendedora_id, `✅ Mandei o pedido ${r.pedidoId} pra ${infoMarca(lote.fornecedor).nome}.\nBoleto: ${reais(r.boleto.valor)} — vence ${dataBR(r.boleto.vencimento)}.\nÉ só pagar que eu identifico sozinha e libero tudo. Código:\n${r.boleto.linhaDigitavel}`);
  return r;
}

export const pedidosDoLote = (loteId) =>
  todos("SELECT DISTINCT p.* FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id WHERE i.lote_id = ?", loteId);

// Pagamento do boleto identificado (pela marca, pelo extrato bancário ou pelo comprovante)
export async function boletoPago(boletoId, forma) {
  const b = um("SELECT * FROM boletos WHERE id = ?", boletoId);
  if (!b || b.status === "pago") return;
  atualizar("boletos", b.id, { status: "pago", pago_em: agora(), forma_identificacao: forma });
  const lanc = um("SELECT * FROM lancamentos WHERE boleto_id = ?", b.id);
  if (lanc) atualizar("lancamentos", lanc.id, { status: "realizado", data: agora().slice(0, 10) });
  const lote = um("SELECT * FROM lotes WHERE id = ?", b.lote_id);
  if (lote?.pedido_fornecedor_id) conector(lote.fornecedor).marcarPago?.(lote.pedido_fornecedor_id);
  registrarEvento(b.revendedora_id, "boleto", `Pagamento identificado (${forma}): ${reais(b.valor)} — ${infoMarca(b.fornecedor).nome}`);
  await paraRevendedora(b.revendedora_id, `💚 Pagamento de ${reais(b.valor)} identificado! A ${infoMarca(b.fornecedor).nome} já vai liberar o pedido. Eu aviso suas clientes.`);
}

// Atualiza status do lote conforme a marca informa
export async function atualizarLote(lote, info) {
  const ordem = ["aguardando_pagamento", "pago", "faturado", "em_transito", "entregue"];
  if (ordem.indexOf(info.status) <= ordem.indexOf(lote.status)) return;
  atualizar("lotes", lote.id, { status: info.status, previsao_chegada: info.previsaoChegada || lote.previsao_chegada, atualizado_em: agora() });
  const chegada = info.previsaoChegada || lote.previsao_chegada;

  if (lote.status === "aguardando_pagamento") {
    const b = um("SELECT * FROM boletos WHERE lote_id = ? AND status != 'pago'", lote.id);
    if (b) await boletoPago(b.id, "confirmado pela marca");
    for (const p of pedidosDoLote(lote.id)) {
      const entrega = somaDias(chegada, 1).toISOString();
      atualizar("pedidos", p.id, { status: "pago", previsao_chegada: chegada, previsao_entrega: entrega, atualizado_em: agora() });
      await paraCliente({ ...p, previsao_chegada: chegada, previsao_entrega: entrega }, "previsao");
    }
  }
  if (info.status === "em_transito") {
    for (const p of pedidosDoLote(lote.id)) if (p.status === "pago") atualizar("pedidos", p.id, { status: "em_transito", atualizado_em: agora() });
  }
  if (info.status === "entregue") {
    registrarEvento(lote.revendedora_id, "lote", `Caixas da ${infoMarca(lote.fornecedor).nome} chegaram (${lote.pedido_fornecedor_id}).`);
    for (const p of pedidosDoLote(lote.id)) {
      const faltam = um("SELECT COUNT(*) AS n FROM itens_pedido i LEFT JOIN lotes l ON l.id = i.lote_id WHERE i.pedido_id = ? AND i.de_estoque = 0 AND (l.status IS NULL OR l.status != 'entregue')", p.id).n;
      if (!faltam) await prontoParaEntrega(p.id);
    }
  }
}

// Produtos na mão da revendedora: chama o motoboy (se automático) e avisa todo mundo
export async function prontoParaEntrega(pedidoId) {
  const p = um("SELECT * FROM pedidos WHERE id = ?", pedidoId);
  if (["em_entrega", "entregue"].includes(p.status) || um("SELECT id FROM entregas WHERE pedido_id = ? AND status != 'cancelado'", pedidoId)) return;
  atualizar("pedidos", p.id, { status: "pronto_para_entrega", atualizado_em: agora() });
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", p.revendedora_id);
  const cli = um("SELECT * FROM clientes WHERE id = ?", p.cliente_id);
  await paraCliente(p, "pronto");
  if (configDe(rev).autoMotoboy && cli.endereco && rev.endereco_coleta) {
    await chamarMotoboy(p.id);
  } else {
    await paraRevendedora(rev.id, `🎁 O pedido de ${cli.nome} está pronto pra entregar.${cli.endereco ? "" : " Falta o endereço da cliente — já pedi pra ela."}`);
  }
}

export async function chamarMotoboy(pedidoId) {
  const p = um("SELECT * FROM pedidos WHERE id = ?", pedidoId);
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", p.revendedora_id);
  const cli = um("SELECT * FROM clientes WHERE id = ?", p.cliente_id);
  if (!cli.endereco || !rev.endereco_coleta) throw new Error("Falta o endereço de coleta ou da cliente para chamar o motoboy");
  const itens = todos("SELECT nome, qtd FROM itens_pedido WHERE pedido_id = ?", p.id).map((i) => `${i.qtd}x ${i.nome}`).join(", ");
  const r = await motoboy.solicitar({
    coleta: { endereco: rev.endereco_coleta, nome: rev.nome, telefone: rev.whatsapp, ...(configDe(rev).coordColeta || {}) },
    entrega: { endereco: cli.endereco, nome: cli.nome, telefone: cli.whatsapp, ...(JSON.parse(cli.preferencias || "{}").coord || {}) },
    observacao: `Pedido RevendIA ${p.id.slice(-6)}`,
  });
  inserir("entregas", { revendedora_id: rev.id, pedido_id: p.id, provedor: r.provedor, provedor_id: r.provedorId, status: "motoboy_designado",
    valor_frete: r.valor, motoboy_nome: r.motoboy, link_rastreio: r.rastreio, criado_em: agora(), atualizado_em: agora() });
  inserir("lancamentos", { revendedora_id: rev.id, tipo: "despesa", categoria: "Frete/motoboy", descricao: `Entrega para ${cli.nome}`, valor: r.valor, data: agora().slice(0, 10), pedido_id: p.id, status: "realizado" });
  atualizar("pedidos", p.id, { status: "em_entrega", atualizado_em: agora() });
  registrarEvento(rev.id, "entrega", `Motoboy chamado para ${cli.nome} (${reais(r.valor)})`);
  await paraRevendedora(rev.id, `🛵 Chamei o motoboy${r.motoboy ? ` (${r.motoboy})` : ""} pra levar o pedido de ${cli.nome}.\nSepare a sacolinha: ${itens}.`);
  await paraCliente(p, "saiu", { motoboy: r.motoboy, rastreio: r.rastreio });
}

const ORDEM_ENTREGA = ["procurando_motoboy", "motoboy_designado", "coletado", "a_caminho", "entregue"];
export async function atualizarEntrega(entrega, status) {
  if (status !== "cancelado" && ORDEM_ENTREGA.indexOf(status) <= ORDEM_ENTREGA.indexOf(entrega.status)) return;
  atualizar("entregas", entrega.id, { status, atualizado_em: agora() });
  if (status === "entregue") {
    const p = um("SELECT * FROM pedidos WHERE id = ?", entrega.pedido_id);
    atualizar("pedidos", p.id, { status: "entregue", atualizado_em: agora() });
    await paraCliente(p, "entregue");
    registrarEvento(p.revendedora_id, "entrega", `Pedido entregue para ${um("SELECT nome FROM clientes WHERE id = ?", p.cliente_id).nome}`);
  }
}

// Entregas manuais (sem motoboy) ou marcar como entregue
export async function marcarEntregue(revendedoraId, pedidoId) {
  const p = um("SELECT * FROM pedidos WHERE id = ? AND revendedora_id = ?", pedidoId, revendedoraId);
  if (!p) throw new Error("Pedido não encontrado");
  atualizar("pedidos", p.id, { status: "entregue", atualizado_em: agora() });
  await paraCliente(p, "entregue");
}

export function detalhar(pedidoId) {
  const p = um("SELECT p.*, c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp, c.endereco AS cliente_endereco FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?", pedidoId);
  if (!p) return null;
  p.itens = todos("SELECT * FROM itens_pedido WHERE pedido_id = ?", pedidoId);
  p.entrega = um("SELECT * FROM entregas WHERE pedido_id = ? ORDER BY criado_em DESC", pedidoId) || null;
  return p;
}
