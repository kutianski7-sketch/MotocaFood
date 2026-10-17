// Visão "Hoje": o que a revendedora precisa fazer (entregar, pagar) e o que os agentes fizeram por ela.
import { um, todos } from "../db.js";
import { dre, fluxoCaixa } from "./financeiro.js";
import { infoMarca } from "../integracoes/fornecedores/index.js";
import { reais, dataBR, dataLocal } from "../util.js";

export function resumoDoDia(revendedoraId) {
  const mes = dataLocal().slice(0, 7);
  const entregas = todos(`SELECT p.id, p.status, p.total, c.nome AS cliente, c.endereco, e.status AS status_entrega, e.motoboy_nome, e.link_rastreio,
      (SELECT GROUP_CONCAT(i.qtd || 'x ' || i.nome, ', ') FROM itens_pedido i WHERE i.pedido_id = p.id) AS itens
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id LEFT JOIN entregas e ON e.pedido_id = p.id AND e.status != 'cancelado'
    WHERE p.revendedora_id = ? AND p.status IN ('pronto_para_entrega','em_entrega') ORDER BY p.atualizado_em`, revendedoraId);
  const boletos = todos("SELECT * FROM boletos WHERE revendedora_id = ? AND status != 'pago' ORDER BY vencimento", revendedoraId)
    .map((b) => ({ ...b, marca: infoMarca(b.fornecedor).nome }));
  const lotes = todos("SELECT * FROM lotes WHERE revendedora_id = ? AND status = 'aberto'", revendedoraId)
    .map((l) => ({ ...l, marca: infoMarca(l.fornecedor).nome, minimo: infoMarca(l.fornecedor).minimoPedido }));
  const alertas = todos("SELECT * FROM tickets WHERE revendedora_id = ? AND status != 'resolvido' AND criticidade IN ('P1','P2') ORDER BY criticidade, criado_em DESC LIMIT 5", revendedoraId);
  const eventos = todos("SELECT * FROM eventos WHERE revendedora_id = ? ORDER BY criado_em DESC LIMIT 15", revendedoraId);
  const emAndamento = um("SELECT COUNT(*) AS n FROM pedidos WHERE revendedora_id = ? AND status NOT IN ('entregue','cancelado')", revendedoraId).n;
  const aReceber = um("SELECT COALESCE(SUM(valor),0) AS v FROM cobrancas WHERE revendedora_id = ? AND status = 'aberta'", revendedoraId).v;
  return { entregas, boletos, lotes, alertas, eventos, emAndamento, aReceber, mes: dre(revendedoraId, mes), caixa: fluxoCaixa(revendedoraId, 15) };
}

// Texto da lista diária enviada no WhatsApp da revendedora
export function textoListaDiaria(rev) {
  const r = resumoDoDia(rev.id);
  const partes = [`☀️ Bom dia, ${rev.nome.split(" ")[0]}! Seu resumo de hoje:`];
  if (r.boletos.length) {
    partes.push(`\n💳 *Boletos pra pagar* (só isso é com você):`);
    for (const b of r.boletos) partes.push(`• ${b.marca}: ${reais(b.valor)} — vence ${dataBR(b.vencimento)}\n  ${b.linha_digitavel}`);
    partes.push("Assim que pagar, eu identifico sozinha ✅");
  }
  if (r.entregas.length) {
    partes.push(`\n🛍️ *Sacolinhas pra entregar ao motoboy*:`);
    for (const e of r.entregas) partes.push(`• ${e.cliente}: ${e.itens}`);
  }
  if (r.alertas.length) partes.push(`\n⚠️ ${r.alertas.length} alerta(s) importante(s) no app.`);
  if (!r.boletos.length && !r.entregas.length) partes.push("\nNada pendente com você hoje. Eu sigo vendendo por aqui 💛");
  partes.push(`\n📈 No mês: ${reais(r.mes.receitaBruta)} vendidos, lucro ${reais(r.mes.lucroLiquido)}.`);
  return partes.join("\n");
}
