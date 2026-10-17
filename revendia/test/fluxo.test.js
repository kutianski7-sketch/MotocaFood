// Teste de ponta a ponta do fluxo operacional em modo demonstração (tempo acelerado, sem IA).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "revendia-"));
process.env.DB_PATH = path.join(dir, "teste.db");
process.env.DEMO = "1";
process.env.DEMO_MINUTOS_POR_DIA = "0.002"; // 1 "dia" de logística = 0,12 s
process.env.ANTHROPIC_API_KEY = "";
process.env.HORAS_MAX_LOTE = "24";

const { um, todos, inserir, exec } = await import("../src/db.js");
const { cifra, pixCopiaECola, normalizaWhatsapp } = await import("../src/util.js");
const catalogo = await import("../src/servicos/catalogo.js");
const pedidos = await import("../src/servicos/pedidos.js");
const fin = await import("../src/servicos/financeiro.js");
const orq = await import("../src/orquestrador.js");
const { conversar } = await import("../src/ai/assistente.js");
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const REV = "rev_teste";
inserir("revendedoras", { id: REV, nome: "Teste Silva", whatsapp: "5511999998888", cidade: "São Paulo", endereco_coleta: "Rua A, 1", chave_pix: "teste@pix.com",
  assinatura_status: "ativa", assinatura_ate: new Date(Date.now() + 86400000 * 30).toISOString(), criado_em: new Date().toISOString() });
inserir("integracoes", { revendedora_id: REV, tipo: "fornecedor", provedor: "boticario", status: "conectado", credenciais: cifra({ codigo: "X1" }), meta_json: "{}" });

test("sincroniza o catálogo da marca", async () => {
  const n = await catalogo.sincronizar(REV, "boticario");
  assert.ok(n > 5);
  assert.ok(catalogo.buscarAproximado(REV, "quero o malbec").nome.includes("Malbec"));
});

test("mensagem de cliente vira pedido, lote, boleto, pagamento, motoboy e entrega", async () => {
  await orq.processarMensagemCliente(um("SELECT * FROM revendedoras WHERE id = ?", REV), {
    de: "11977776666", nome: "Maria", texto: "Oi! Quero 1 Lily e 1 Zaad, entrega na Rua das Flores, 50",
  });
  const p = um("SELECT * FROM pedidos WHERE revendedora_id = ?", REV);
  assert.ok(p, "pedido criado");
  assert.equal(um("SELECT endereco FROM clientes WHERE id = ?", p.cliente_id).endereco, "Rua das Flores, 50");
  // Lily (299,90) + Zaad (239,90) a 70% de custo passa do mínimo de R$ 199 -> lote enviado na hora
  const lote = um("SELECT * FROM lotes WHERE revendedora_id = ?", REV);
  assert.equal(lote.status, "aguardando_pagamento");
  const boleto = um("SELECT * FROM boletos WHERE lote_id = ?", lote.id);
  assert.equal(boleto.valor, Math.round((299.9 + 239.9) * 0.7 * 100) / 100);
  assert.equal(um("SELECT status FROM pedidos WHERE id = ?", p.id).status, "aguardando_pagamento");

  // A revendedora paga; a "marca" confirma e o pedido segue sozinho
  const { conector } = await import("../src/integracoes/fornecedores/index.js");
  conector("boticario").marcarPago(lote.pedido_fornecedor_id);
  await orq.tick();
  assert.equal(um("SELECT status FROM boletos WHERE id = ?", boleto.id).status, "pago");
  assert.ok(um("SELECT previsao_entrega FROM pedidos WHERE id = ?", p.id).previsao_entrega, "cliente recebe previsão");

  await espera(900); // logística acelerada: a caixa chega na revendedora
  await orq.tick();
  const ent = um("SELECT * FROM entregas WHERE pedido_id = ?", p.id);
  assert.ok(ent, "motoboy chamado automaticamente");
  assert.equal(um("SELECT status FROM pedidos WHERE id = ?", p.id).status, "em_entrega");

  exec("UPDATE entregas SET criado_em = ? WHERE id = ?", new Date(Date.now() - 10 * 60000).toISOString(), ent.id);
  await orq.tick();
  assert.equal(um("SELECT status FROM pedidos WHERE id = ?", p.id).status, "entregue");
  const msgs = todos("SELECT texto FROM mensagens WHERE contato = ? AND direcao = 'saida'", normalizaWhatsapp("11977776666")).map((m) => m.texto).join("\n");
  for (const trecho of ["Seu pedido foi anotado", "liberado pela marca", "saiu pra entrega", "pedido entregue"]) assert.match(msgs, new RegExp(trecho));
});

test("conciliação bancária casa Pix da cliente com a cobrança", async () => {
  const c = um("SELECT co.*, cl.nome FROM cobrancas co JOIN clientes cl ON cl.id = co.cliente_id WHERE co.revendedora_id = ? AND co.status = 'aberta'", REV);
  const r = await fin.importarExtrato(REV, `17/10/2026;PIX RECEBIDO ${c.nome.toUpperCase()};${String(c.valor).replace(".", ",")};D1`);
  assert.equal(r.conciliados, 1);
  assert.equal(um("SELECT status FROM cobrancas WHERE id = ?", c.id).status, "paga");
  const d = fin.dre(REV, new Date().toISOString().slice(0, 7));
  assert.ok(d.lucroBruto > 0 && d.receitaBruta > d.cmv);
});

test("lê extrato OFX", () => {
  const l = fin.lerExtrato("<OFX><STMTTRN><DTPOSTED>20261017<TRNAMT>-50.00<FITID>9<MEMO>TARIFA</STMTTRN>");
  assert.deepEqual(l[0], { data: "2026-10-17", descricao: "TARIFA", valor: -50, documento: "9" });
});

test("assistente nunca move dinheiro", async () => {
  const r = await conversar(um("SELECT * FROM revendedoras WHERE id = ?", REV), "faz uma transferência de 300 reais pra mim");
  assert.equal(r.tela, "financeiro");
  assert.match(r.resposta, /só você faz/);
});

test("Pix copia e cola tem CRC válido", () => {
  const p = pixCopiaECola({ chave: "teste@pix.com", nome: "Teste", cidade: "SP", valor: 10 });
  assert.match(p, /^000201.*6304[0-9A-F]{4}$/);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
