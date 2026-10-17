// Cobrança da assinatura da RevendIA via Mercado Pago (PIX e cartão de crédito).
// Sem token (modo demo): gera um Pix copia-e-cola de exemplo e permite simular a aprovação.
import { config } from "../config.js";
import { pixCopiaECola } from "../util.js";

const MP = "https://api.mercadopago.com";
export const real = () => Boolean(config.mercadoPago.token);

async function mp(metodo, caminho, corpo, idempotencia) {
  const r = await fetch(MP + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${config.mercadoPago.token}`,
      "Content-Type": "application/json",
      ...(idempotencia ? { "X-Idempotency-Key": idempotencia } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Mercado Pago: ${d.message || r.status}`);
  return d;
}

export async function criarPix({ assinaturaId, valor, descricao, nome, whatsapp }) {
  if (!real()) {
    return {
      provedorId: `demo_${assinaturaId}`,
      copiaECola: pixCopiaECola({ chave: "pagamentos@revendia.com.br", nome: "RevendIA", cidade: "SAO PAULO", valor, txid: assinaturaId.slice(0, 25) }),
      qrBase64: null,
    };
  }
  const d = await mp("POST", "/v1/payments", {
    transaction_amount: valor,
    description: descricao,
    payment_method_id: "pix",
    external_reference: assinaturaId,
    notification_url: `${config.baseUrl}/api/webhooks/mercadopago`,
    payer: { email: `${whatsapp}@clientes.revendia.com.br`, first_name: nome?.split(" ")[0] || "Revendedora" },
  }, assinaturaId);
  const t = d.point_of_interaction?.transaction_data || {};
  return { provedorId: String(d.id), copiaECola: t.qr_code, qrBase64: t.qr_code_base64 };
}

// Cartão: Checkout Pro (página segura do Mercado Pago; aceita parcelamento)
export async function criarLinkCartao({ assinaturaId, valor, descricao }) {
  if (!real()) return { provedorId: `demo_${assinaturaId}`, link: `${config.baseUrl}/assinar/demo-cartao?a=${assinaturaId}` };
  const d = await mp("POST", "/checkout/preferences", {
    items: [{ title: descricao, quantity: 1, unit_price: valor, currency_id: "BRL" }],
    external_reference: assinaturaId,
    payment_methods: { excluded_payment_types: [{ id: "ticket" }], installments: 12 },
    back_urls: { success: `${config.baseUrl}/app/?assinatura=${assinaturaId}`, failure: `${config.baseUrl}/assinar?erro=1`, pending: `${config.baseUrl}/app/?assinatura=${assinaturaId}` },
    auto_return: "approved",
    notification_url: `${config.baseUrl}/api/webhooks/mercadopago`,
  });
  return { provedorId: d.id, link: d.init_point };
}

// Webhook: consulta o pagamento e devolve { assinaturaId, aprovado }
export async function consultarPagamento(pagamentoId) {
  const d = await mp("GET", `/v1/payments/${pagamentoId}`);
  return { assinaturaId: d.external_reference, aprovado: d.status === "approved", status: d.status };
}
