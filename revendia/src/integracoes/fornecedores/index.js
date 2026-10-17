// Conectores com as fornecedoras (Boticário, Natura, Avon, Eudora...).
//
// Todos os conectores seguem a mesma interface:
//   conectar(credenciais)            -> { conta, nomeExibicao }
//   sincronizarCatalogo(cred)        -> [{ sku, nome, categoria, preco_catalogo, preco_custo, imagem }]
//   enviarPedido(cred, itens)        -> { pedidoId, boleto: { valor, vencimento, linhaDigitavel, pixCopiaECola }, previsaoChegada }
//   consultarPedido(cred, pedidoId)  -> { status: aguardando_pagamento|pago|faturado|em_transito|entregue, previsaoChegada }
//
// Drivers:
//   "parceiro" — API oficial da marca (via parceria/credenciamento). Configure FORNECEDOR_<MARCA>_API_URL e
//                FORNECEDOR_<MARCA>_API_KEY; o contrato HTTP esperado está descrito em docs/INTEGRACOES.md.
//   "demo"     — simula a marca (catálogo, boleto, faturamento e transporte) com o tempo acelerado.
import crypto from "node:crypto";
import { config } from "../../config.js";
import { CATALOGOS } from "./catalogo-base.js";
import { somaDias, centavos } from "../../util.js";

const MIN_POR_DIA = Number(process.env.DEMO_MINUTOS_POR_DIA || 1); // no demo, 1 "dia" de logística = 1 minuto

function urlParceiro(marca) {
  const k = marca.toUpperCase();
  const url = process.env[`FORNECEDOR_${k}_API_URL`];
  return url ? { url: url.replace(/\/$/, ""), chave: process.env[`FORNECEDOR_${k}_API_KEY`] || "" } : null;
}

// ---------- Driver "parceiro" (HTTP) ----------
function driverParceiro(marca, api) {
  const chamar = async (metodo, caminho, cred, corpo) => {
    const r = await fetch(api.url + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", "X-Api-Key": api.chave, "X-Revendedor-Codigo": cred?.codigo || "", Authorization: cred?.token ? `Bearer ${cred.token}` : "" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${marca}: ${dados.mensagem || dados.message || r.status}`);
    return dados;
  };
  return {
    driver: "parceiro",
    async conectar(cred) {
      const d = await chamar("POST", "/revendedores/autenticar", null, { codigo: cred.codigo, senha: cred.senha });
      return { conta: d.codigo || cred.codigo, nomeExibicao: d.nome, token: d.token };
    },
    sincronizarCatalogo: (cred) => chamar("GET", "/catalogo/ciclo-atual", cred).then((d) => d.produtos),
    enviarPedido: (cred, itens) => chamar("POST", "/pedidos", cred, { itens }),
    consultarPedido: (cred, id) => chamar("GET", `/pedidos/${encodeURIComponent(id)}`, cred),
  };
}

// ---------- Driver "demo" ----------
const pedidosDemo = new Map(); // pedidoId -> { criado, pagoEm, prazoDias }
function linhaDigitavel() {
  const n = () => String(crypto.randomInt(0, 99999)).padStart(5, "0");
  return `23793.${n()} ${n()}.${n()}6 ${n()}.${n()}1 1 ${String(crypto.randomInt(1e9, 9e9))}${String(crypto.randomInt(1e4, 9e4))}`;
}
function driverDemo(marca) {
  const cat = CATALOGOS[marca];
  return {
    driver: "demo",
    async conectar(cred) {
      if (!cred?.codigo) throw new Error("Informe o código/login de revendedora");
      return { conta: cred.codigo, nomeExibicao: `${cat?.nome || marca} • ${cred.codigo}` };
    },
    async sincronizarCatalogo() {
      if (!cat) return [];
      return cat.produtos.map((p) => ({
        ...p,
        preco_custo: centavos(p.preco_catalogo * (1 - cat.margem)),
        imagem: `/assets/produtos/${p.categoria.toLowerCase().includes("perfum") ? "perfume" : p.categoria.toLowerCase().includes("maqui") ? "make" : "creme"}.svg`,
      }));
    },
    async enviarPedido(cred, itens) {
      const valor = centavos(itens.reduce((s, i) => s + i.custo_unit * i.qtd, 0));
      const pedidoId = `${marca.slice(0, 2).toUpperCase()}${Date.now().toString().slice(-8)}`;
      const prazoDias = cat?.prazoDias || 5;
      pedidosDemo.set(pedidoId, { criado: Date.now(), pagoEm: null, prazoDias });
      return {
        pedidoId,
        boleto: { valor, vencimento: somaDias(new Date(), 2).toISOString(), linhaDigitavel: linhaDigitavel(), pixCopiaECola: null },
        previsaoChegada: somaDias(new Date(), prazoDias + 1).toISOString(),
      };
    },
    // Em demo, a "marca" reconhece o pagamento assim que a revendedora paga (o orquestrador avisa via marcarPago)
    async consultarPedido(cred, pedidoId) {
      const p = pedidosDemo.get(pedidoId);
      if (!p || !p.pagoEm) return { status: "aguardando_pagamento" };
      const dias = (Date.now() - p.pagoEm) / 60000 / MIN_POR_DIA;
      const chegada = new Date(p.pagoEm + p.prazoDias * MIN_POR_DIA * 60000).toISOString();
      if (dias >= p.prazoDias) return { status: "entregue", previsaoChegada: chegada };
      if (dias >= 1) return { status: "em_transito", previsaoChegada: chegada };
      if (dias >= 0.3) return { status: "faturado", previsaoChegada: chegada };
      return { status: "pago", previsaoChegada: chegada };
    },
    marcarPago(pedidoId) {
      const p = pedidosDemo.get(pedidoId) || { criado: Date.now(), prazoDias: cat?.prazoDias || 5 };
      p.pagoEm = Date.now();
      pedidosDemo.set(pedidoId, p);
    },
  };
}

export function conector(marca) {
  const api = urlParceiro(marca);
  if (api) return driverParceiro(marca, api);
  if (config.demo) return driverDemo(marca);
  throw new Error(`A integração automática com ${CATALOGOS[marca]?.nome || marca} ainda não está habilitada neste servidor. Use o catálogo manual.`);
}

export const infoMarca = (marca) => CATALOGOS[marca] || { nome: marca, minimoPedido: 0, margem: 0.3, prazoDias: 5, produtos: [] };
