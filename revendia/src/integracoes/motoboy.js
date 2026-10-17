// Entregas por motoboy. Driver real: Lalamove API v3 (opera no Brasil). Sem chave: simulação.
import crypto from "node:crypto";
import { config } from "../config.js";

const L = config.lalamove;
export const real = () => Boolean(L.chave && L.segredo);

async function lalamove(metodo, caminho, corpo) {
  const ts = Date.now().toString();
  const body = corpo ? JSON.stringify({ data: corpo }) : "";
  const assinatura = crypto.createHmac("sha256", L.segredo).update(`${ts}\r\n${metodo}\r\n${caminho}\r\n\r\n${body}`).digest("hex");
  const r = await fetch(L.baseUrl + caminho, {
    method: metodo,
    headers: { Authorization: `hmac ${L.chave}:${ts}:${assinatura}`, Market: L.mercado, "Content-Type": "application/json" },
    body: body || undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Lalamove: ${dados?.errors?.[0]?.message || r.status}`);
  return dados.data;
}

// coleta/entrega: { endereco, lat, lng, nome, telefone }
export async function solicitar({ coleta, entrega, observacao }) {
  if (!real()) {
    return { provedor: "simulado", provedorId: `MOTO${Date.now().toString().slice(-6)}`, valor: 12.9, motoboy: "Carlos (simulação)", rastreio: null };
  }
  const ponto = (p) => ({ coordinates: { lat: String(p.lat), lng: String(p.lng) }, address: p.endereco });
  const cotacao = await lalamove("POST", "/v3/quotations", {
    serviceType: "MOTORCYCLE", language: "pt_BR", stops: [ponto(coleta), ponto(entrega)], isRouteOptimized: false,
  });
  const pedido = await lalamove("POST", "/v3/orders", {
    quotationId: cotacao.quotationId,
    sender: { stopId: cotacao.stops[0].stopId, name: coleta.nome, phone: `+${coleta.telefone}` },
    recipients: [{ stopId: cotacao.stops[1].stopId, name: entrega.nome, phone: `+${entrega.telefone}`, remarks: observacao || "" }],
  });
  return { provedor: "lalamove", provedorId: pedido.orderId, valor: Number(cotacao.priceBreakdown?.total || 0), motoboy: null, rastreio: pedido.shareLink };
}

export async function consultar(entrega) {
  if (entrega.provedor !== "lalamove") {
    // Simulação: avança com o tempo
    const min = (Date.now() - new Date(entrega.criado_em).getTime()) / 60000;
    return { status: min > 4 ? "entregue" : min > 2 ? "a_caminho" : min > 1 ? "coletado" : "motoboy_designado" };
  }
  const d = await lalamove("GET", `/v3/orders/${entrega.provedor_id}`);
  const mapa = { ASSIGNING_DRIVER: "procurando_motoboy", ON_GOING: "a_caminho", PICKED_UP: "coletado", COMPLETED: "entregue", CANCELED: "cancelado", EXPIRED: "cancelado" };
  return { status: mapa[d.status] || d.status, rastreio: d.shareLink };
}
