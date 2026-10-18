// RevendIA — app da revendedora (PWA, sem build). Telas: login, configuração automática, hoje, pedidos,
// agentes (marketing/comercial/operações), financeiro, catálogo, clientes, integrações e assistente de voz.
const $ = (s, el = document) => el.querySelector(s);
const tela = $("#tela");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—");
const horaBR = (d) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
let conta = null;

async function api(caminho, opcoes = {}) {
  const r = await fetch("/api" + caminho, {
    method: opcoes.method || (opcoes.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    credentials: "same-origin",
  });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401) { mostrarLogin(); throw new Error(dados.erro); }
  if (r.status === 402) { location.href = "/assinar?expirou=1"; throw new Error(dados.erro); }
  if (r.status === 428) { const okc = await confirmarComCodigo(); if (okc) return api(caminho, opcoes); throw new Error("Confirmação cancelada"); }
  if (!r.ok) throw new Error(dados.erro || "Algo deu errado");
  return dados;
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
async function acao(btn, fn, sucesso) {
  btn.disabled = true;
  try { const r = await fn(); if (sucesso) toast(typeof sucesso === "function" ? sucesso(r) : sucesso); return r; }
  catch (e) { toast(e.message); } finally { btn.disabled = false; }
}
function folha(html) {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
  document.body.appendChild(o);
  return o;
}
const copiar = (t) => navigator.clipboard?.writeText(t).then(() => toast("Copiado!"));

const STATUS = {
  novo: ["Novo", ""], aguardando_lote: ["Juntando p/ pedido mínimo", "warn"], aguardando_pagamento: ["Boleto a pagar", "warn"], pago: ["Pago na marca", "rose"],
  em_transito: ["A caminho de você", "rose"], pronto_para_entrega: ["Pronto p/ entregar", "ok"], em_entrega: ["Com o motoboy", "ok"], entregue: ["Entregue", "ok"], cancelado: ["Cancelado", "crit"],
};
const pillStatus = (s) => `<span class="pill ${STATUS[s]?.[1] || ""}">${STATUS[s]?.[0] || esc(s)}</span>`;
const CRIT = { P1: ["Crítico", "crit"], P2: ["Alto", "warn"], P3: ["Médio", "rose"], P4: ["Baixo", ""] };

// ---------------- Login (WhatsApp + código) ----------------
function mostrarLogin() {
  $("#nav").classList.add("hidden"); $("#fab").classList.add("hidden"); $("#status-piloto").classList.add("hidden");
  tela.innerHTML = `
    <div class="card hero center" style="margin-top:12px">
      <h1>Sua revenda no piloto automático ✨</h1>
      <p class="muted">Entre com o WhatsApp que você usou na assinatura.</p>
    </div>
    <div class="card" id="passo1">
      <label for="w">Seu WhatsApp</label>
      <input id="w" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-0000">
      <button class="btn primary block mt" id="enviar">Receber código no WhatsApp</button>
      <p class="center mt"><small>Ainda não tem conta? <a href="/assinar">Teste grátis por 7 dias</a></small></p>
    </div>
    <div class="card hidden" id="passo2">
      <p>Digite o código de 6 números que enviamos no seu WhatsApp:</p>
      <div class="codigo">${Array.from({ length: 6 }, () => `<input inputmode="numeric" maxlength="1" aria-label="dígito">`).join("")}</div>
      <p class="center mt" id="dev"></p>
      <button class="btn primary block mt" id="entrar">Entrar</button>
    </div>
    <div class="center"><button class="btn ghost hidden" id="demo">Ver demonstração</button></div>`;
  const w = $("#w");
  w.value = localStorage.getItem("rv_whatsapp") || "";
  fetch("/api/auth/demo").then((r) => r.json()).then((d) => { if (d.demo) $("#demo").classList.remove("hidden"); }).catch(() => {});
  $("#demo").onclick = async () => { await fetch("/api/auth/demo", { method: "POST" }); iniciar(); };
  const caixas = [...document.querySelectorAll(".codigo input")];
  caixas.forEach((c, i) => {
    c.addEventListener("input", () => {
      const v = c.value.replace(/\D/g, "");
      if (v.length > 1) { v.split("").slice(0, 6).forEach((d, k) => (caixas[k].value = d)); caixas[5].focus(); }
      else { c.value = v; if (v && caixas[i + 1]) caixas[i + 1].focus(); }
      if (caixas.every((x) => x.value)) $("#entrar").click();
    });
    c.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !c.value && caixas[i - 1]) caixas[i - 1].focus(); });
  });
  $("#enviar").onclick = (e) => acao(e.target, async () => {
    const r = await api("/auth/enviar-codigo", { body: { whatsapp: w.value } }).catch((err) => { if (/assinatura/.test(err.message)) location.href = "/assinar"; throw err; });
    localStorage.setItem("rv_whatsapp", w.value);
    $("#passo1").classList.add("hidden"); $("#passo2").classList.remove("hidden"); caixas[0].focus();
    if (r.codigoDev) $("#dev").innerHTML = `<small>Ambiente de teste — código: <b>${r.codigoDev}</b></small>`;
  });
  $("#entrar").onclick = (e) => acao(e.target, async () => {
    const r = await api("/auth/verificar", { body: { whatsapp: w.value, codigo: caixas.map((c) => c.value).join("") } });
    await iniciar(r.novo ? "#configurar" : null);
  });
}

// Código extra para ações sensíveis (Pix/conta bancária)
function confirmarComCodigo() {
  return new Promise((resolver) => {
    const o = folha(`<h2>🔒 Confirmação de segurança</h2><p>Mexer em dados de recebimento só com a sua confirmação. Enviamos um código no seu WhatsApp.</p>
      <input id="cc" inputmode="numeric" maxlength="6" placeholder="Código de 6 números"><p id="ccdev"></p>
      <button class="btn primary block mt" id="ccok">Confirmar</button><button class="btn ghost block mt" id="ccx">Cancelar</button>`);
    api("/auth/confirmar/enviar", { body: {} }).then((r) => { if (r.codigoDev) $("#ccdev", o).innerHTML = `<small>Teste — código: <b>${r.codigoDev}</b></small>`; }).catch((e) => toast(e.message));
    $("#ccx", o).onclick = () => { o.remove(); resolver(false); };
    $("#ccok", o).onclick = (e) => acao(e.target, async () => { await api("/auth/confirmar", { body: { codigo: $("#cc", o).value } }); o.remove(); resolver(true); });
  });
}

// ---------------- Configuração automática ("Deixa com a IA") ----------------
async function telaConfigurar() {
  tela.innerHTML = `
    <div class="card hero"><h1>Oi, ${esc(conta.nome.split(" ")[0])}! 💛</h1>
      <p>Eu sou a Bia, a IA da RevendIA. Toque no botão e eu deixo tudo integrado e funcionando pra você.</p>
      <button class="btn block mt" style="background:#fff;color:#3B1E54" id="auto">✨ Deixa com a IA</button></div>
    <div id="resultado"></div>`;
  $("#auto").onclick = (e) => acao(e.target, rodarAuto);
}
async function rodarAuto() {
  const r = await api("/integracoes/automatico", { body: {} });
  const passos = {
    fornecedor: () => formFornecedor(),
    whatsapp: () => `<button class="btn dark block" data-a="whatsapp">Conectar WhatsApp</button>`,
    instagram: () => `<button class="btn dark block" data-a="instagram">Conectar Instagram</button>`,
    endereco: () => `<input id="end" placeholder="Rua, número, bairro, cidade"><button class="btn dark block mt" data-a="endereco">Salvar endereço</button>`,
    pix: () => `<input id="pix" placeholder="Sua chave Pix (CPF, e-mail, celular ou aleatória)"><button class="btn dark block mt" data-a="pix">Salvar chave Pix</button>`,
  };
  $("#resultado").innerHTML = `
    ${r.feito.length ? `<div class="card"><h2>Já deixei pronto</h2><ul class="list">${r.feito.map((f) => `<li>✅ ${esc(f)}</li>`).join("")}</ul></div>` : ""}
    ${r.pendente.map((p) => `<div class="card"><h3>${esc(p.texto)}</h3>${passos[p.passo]()}</div>`).join("")}
    ${r.pronto ? `<div class="card center"><h2>Tudo rodando! 🚀</h2><p>A partir de agora, você só paga os boletos e entrega as sacolinhas ao motoboy.</p><a class="btn primary block mt" href="#hoje">Ir para o meu dia</a></div>` : ""}`;
  ligarFormFornecedor($("#resultado"), rodarAuto);
  $("#resultado").querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => acao(b, async () => {
    const a = b.dataset.a;
    if (a === "whatsapp") await conectarWhatsapp();
    if (a === "instagram") await conectarInstagram();
    if (a === "endereco") await api("/conta", { method: "PUT", body: { endereco_coleta: $("#end").value } });
    if (a === "pix") await api("/conta/recebimento", { method: "PUT", body: { chave_pix: $("#pix").value } });
    conta = await api("/conta");
    await rodarAuto();
  })));
}
function formFornecedor(marcaPadrao = "boticario") {
  return `<div class="ff"><label>Marca</label><select class="ff-marca">${["boticario|O Boticário", "natura|Natura", "avon|Avon", "eudora|Eudora"].map((m) => { const [v, n] = m.split("|"); return `<option value="${v}" ${v === marcaPadrao ? "selected" : ""}>${n}</option>`; }).join("")}</select>
    <label>Seu código/login de revendedora</label><input class="ff-cod" autocomplete="username">
    <label>Senha da marca</label><input class="ff-senha" type="password" autocomplete="current-password">
    <p><small>🔒 Guardada criptografada. Usamos só para puxar o catálogo e repassar seus pedidos.</small></p>
    <button class="btn dark block mt ff-ok">Conectar e puxar catálogo</button></div>`;
}
function ligarFormFornecedor(el, depois) {
  el.querySelectorAll(".ff").forEach((f) => ($(".ff-ok", f).onclick = (e) => acao(e.target, async () => {
    const r = await api("/integracoes/fornecedor", { body: { marca: $(".ff-marca", f).value, codigo: $(".ff-cod", f).value, senha: $(".ff-senha", f).value } });
    toast(`Conectado! ${r.produtos} produtos no seu catálogo`);
    await depois?.();
  })));
}
async function conectarInstagram() {
  const r = await api("/integracoes/instagram/conectar");
  if (r.url) location.href = r.url; else toast("Instagram conectado!");
}
async function conectarWhatsapp() {
  const i = await api("/integracoes");
  if (!i.disponivel.whatsappReal) { await api("/integracoes/whatsapp", { body: {} }); return toast("WhatsApp conectado!"); }
  // Cadastro Incorporado da Meta (popup oficial)
  await new Promise((ok) => {
    if (window.FB) return ok();
    window.fbAsyncInit = () => { FB.init({ appId: i.disponivel.metaAppId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); ok(); };
    const s = document.createElement("script"); s.src = "https://connect.facebook.net/pt_BR/sdk.js"; s.async = true; document.body.appendChild(s);
  });
  let sessao = {};
  window.addEventListener("message", (ev) => {
    if (!/facebook\.com$/.test(new URL(ev.origin).hostname)) return;
    try { const d = JSON.parse(ev.data); if (d.type === "WA_EMBEDDED_SIGNUP" && d.event === "FINISH") sessao = d.data; } catch {}
  });
  await new Promise((ok, falha) => FB.login((resp) => {
    if (!resp.authResponse?.code) return falha(new Error("Conexão cancelada"));
    api("/integracoes/whatsapp", { body: { code: resp.authResponse.code, phoneNumberId: sessao.phone_number_id, wabaId: sessao.waba_id } }).then(ok, falha);
  }, { config_id: i.disponivel.embeddedSignupConfigId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } }));
  toast("WhatsApp conectado!");
}

// ---------------- Hoje ----------------
async function telaHoje() {
  const h = await api("/hoje");
  const nome = conta.nome.split(" ")[0];
  const saud = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";
  const diasTeste = conta.assinatura_status === "teste" ? Math.max(0, Math.ceil((new Date(conta.assinatura_ate) - Date.now()) / 86400000)) : null;
  tela.innerHTML = `
    ${diasTeste !== null && diasTeste <= 30 ? `<div class="card row between"><div><b>Teste grátis</b><br><small>${diasTeste === 0 ? "termina hoje" : `faltam ${diasTeste} dia${diasTeste > 1 ? "s" : ""}`}. Depois, é só escolher um plano no PIX ou cartão.</small></div><a class="btn sm primary" href="/assinar">Assinar</a></div>` : ""}
    <div class="card hero">
      <p class="muted" style="margin:0">${saud}, ${esc(nome)} 💛</p>
      <h1 style="margin:.2em 0 .6em">${h.boletos.length || h.entregas.length ? "Hoje você só precisa disso:" : "Nada com você hoje. A IA cuida do resto!"}</h1>
      <div class="grid3">
        <div class="stat"><b>${inteiro(h.mes.receitaBruta)}</b><span>vendas no mês</span></div>
        <div class="stat"><b>${inteiro(h.mes.lucroLiquido)}</b><span>lucro no mês</span></div>
        <div class="stat"><b>${inteiro(h.aReceber)}</b><span>a receber</span></div>
      </div>
    </div>
    ${h.boletos.length ? `<div class="card"><div class="row between"><h2>💳 Pagar</h2><span class="pill warn">só isso é manual</span></div><ul class="list">${h.boletos.map((b) => `
      <li><div class="row between"><b>${esc(b.marca)}</b><b>${brl(b.valor)}</b></div>
        <small>Vence ${dataBR(b.vencimento)}</small>
        <div class="mono mt">${esc(b.linha_digitavel)}</div>
        <div class="row mt"><button class="btn sm" data-copiar="${esc(b.linha_digitavel)}">Copiar código</button>
        ${b.status === "informado" ? `<span class="pill rose">Identificando pagamento…</span>` : `<button class="btn sm ok" data-paguei="${b.id}">Já paguei</button>`}</div></li>`).join("")}</ul>
      <p><small>Você paga no app do seu banco. A RevendIA identifica o pagamento sozinha (pela marca, pelo extrato ou pelo comprovante que você mandar no WhatsApp).</small></p></div>` : ""}
    ${h.entregas.length ? `<div class="card"><h2>🛍️ Entregar ao motoboy</h2><ul class="list">${h.entregas.map((e) => `
      <li><div class="row between"><b>${esc(e.cliente)}</b>${e.status_entrega ? `<span class="pill ok">🛵 ${esc(e.status_entrega.replace(/_/g, " "))}</span>` : `<span class="pill warn">aguardando motoboy</span>`}</div>
        <small>${esc(e.itens)}</small><br><small>📍 ${esc(e.endereco || "sem endereço")}</small>
        ${!e.status_entrega ? `<div class="row mt"><button class="btn sm dark" data-moto="${e.id}">Chamar motoboy</button><button class="btn sm" data-entregue="${e.id}">Entreguei eu mesma</button></div>` : ""}</li>`).join("")}</ul></div>` : ""}
    ${h.lotes.length ? `<div class="card"><h2>📦 Pedidos sendo montados</h2>${h.lotes.map((l) => `
      <div class="mt"><div class="row between"><b>${esc(l.marca)}</b><small>${brl(l.total_custo)} de ${brl(l.minimo)}</small></div>
      <div class="progress mt"><i style="width:${Math.min(100, (l.total_custo / (l.minimo || 1)) * 100)}%"></i></div>
      <div class="row between mt"><small>${l.total_custo >= l.minimo ? "Mínimo atingido — enviando" : "Envio automático ao atingir o mínimo (ou em 24h)"}</small><button class="btn sm" data-lote="${l.id}">Enviar agora</button></div></div>`).join("")}</div>` : ""}
    ${h.alertas.length ? `<div class="card"><h2>⚠️ Atenção</h2><ul class="list">${h.alertas.map((a) => `<li><span class="pill ${CRIT[a.criticidade][1]}">${CRIT[a.criticidade][0]}</span> <b>${esc(a.assunto)}</b><br><small>${esc(a.descricao)}</small></li>`).join("")}</ul></div>` : ""}
    ${h.caixa.alerta ? `<div class="card"><span class="pill crit">Caixa</span> ${esc(h.caixa.alerta)}</div>` : ""}
    ${conta.demo ? `<div class="card"><h2>🧪 Simular cliente no WhatsApp</h2><p><small>Veja a IA anotando o pedido, repassando à marca e avisando a cliente.</small></p>
      <input id="simnome" placeholder="Nome da cliente" value="Marina">
      <textarea id="simtexto" class="mt">Oi Ju! Quero 1 Malbec e 1 hidratante Nativa SPA, entrega na Rua Vergueiro, 900</textarea>
      <button class="btn primary block mt" id="simular">Enviar como cliente</button><div id="simconversa"></div></div>` : ""}
    <div class="card"><h2>🤖 O que a IA fez por você</h2><ul class="list feed">${h.eventos.map((e) => `<li><span class="dot"></span><div>${esc(e.mensagem)}<br><small>${horaBR(e.criado_em)}</small></div></li>`).join("") || `<li class="empty">Assim que chegarem pedidos, tudo aparece aqui.</li>`}</ul></div>`;
  tela.querySelectorAll("[data-copiar]").forEach((b) => (b.onclick = () => copiar(b.dataset.copiar)));
  tela.querySelectorAll("[data-paguei]").forEach((b) => (b.onclick = () => acao(b, () => api(`/boletos/${b.dataset.paguei}/paguei`, { body: {} }), (r) => r.mensagem).then(() => setTimeout(rotear, 3500))));
  tela.querySelectorAll("[data-moto]").forEach((b) => (b.onclick = () => acao(b, () => api(`/pedidos/${b.dataset.moto}/motoboy`, { body: {} }), "Motoboy chamado! 🛵").then(rotear)));
  tela.querySelectorAll("[data-entregue]").forEach((b) => (b.onclick = () => acao(b, () => api(`/pedidos/${b.dataset.entregue}/entregue`, { body: {} }), "Marcado como entregue").then(rotear)));
  tela.querySelectorAll("[data-lote]").forEach((b) => (b.onclick = () => acao(b, () => api(`/lotes/${b.dataset.lote}/enviar`, { body: {} }), "Pedido enviado à marca!").then(rotear)));
  const sim = $("#simular");
  if (sim) sim.onclick = () => acao(sim, async () => {
    const r = await api("/simular/mensagem", { body: { nome: $("#simnome").value, de: "11988887777", texto: $("#simtexto").value } });
    $("#simconversa").innerHTML = r.conversa.map((m) => `<div class="bubble ${m.direcao === "entrada" ? "eu" : "ia"}">${esc(m.texto)}</div>`).join("");
  });
}

// ---------------- Pedidos ----------------
let filtroPedidos = "ativos";
async function telaPedidos() {
  const lista = await api("/pedidos");
  const filtros = { ativos: (p) => !["entregue", "cancelado"].includes(p.status), entregues: (p) => p.status === "entregue", todos: () => true };
  const vis = lista.filter(filtros[filtroPedidos]);
  tela.innerHTML = `
    <div class="row between"><h1>Pedidos</h1><button class="btn primary sm" id="novo">+ Novo</button></div>
    <div class="tabs">${Object.keys(filtros).map((f) => `<button class="tab ${f === filtroPedidos ? "on" : ""}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}</div>
    <div class="card"><ul class="list">${vis.map((p) => `<li data-p="${p.id}" style="cursor:pointer"><div class="row between"><b>${esc(p.cliente_nome)}</b><b>${brl(p.total)}</b></div>
      <small>${esc(p.itens || "")}</small><div class="row between mt">${pillStatus(p.status)}<small>${horaBR(p.criado_em)}</small></div></li>`).join("") || `<li class="empty">Nenhum pedido aqui.</li>`}</ul></div>`;
  tela.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filtroPedidos = b.dataset.f; telaPedidos(); }));
  tela.querySelectorAll("[data-p]").forEach((li) => (li.onclick = () => detalhePedido(li.dataset.p)));
  $("#novo").onclick = novoPedido;
}
async function detalhePedido(id) {
  const p = await api(`/pedidos/${id}`);
  const o = folha(`<div class="row between"><h2>${esc(p.cliente_nome)}</h2>${pillStatus(p.status)}</div>
    <ul class="list">${p.itens.map((i) => `<li class="row between"><span>${i.qtd}x ${esc(i.nome)} ${i.de_estoque ? `<span class="pill ok">estoque</span>` : ""}</span><b>${brl(i.preco_unit * i.qtd)}</b></li>`).join("")}</ul>
    <p class="row between"><span>Total</span><b>${brl(p.total)}</b></p><p class="row between"><span>Seu lucro</span><b>${brl(p.total - p.custo)}</b></p>
    <p><small>Chega pra você: ${dataBR(p.previsao_chegada)} • Entrega: ${dataBR(p.previsao_entrega)}</small></p>
    <p><small>📍 ${esc(p.cliente_endereco || "sem endereço")} • ${p.pago_pelo_cliente ? "✅ cliente pagou" : "⏳ aguardando pagamento da cliente"}</small></p>
    ${p.entrega ? `<p><span class="pill ok">🛵 ${esc(p.entrega.status)}</span> ${p.entrega.link_rastreio ? `<a href="${esc(p.entrega.link_rastreio)}" target="_blank" rel="noopener">rastrear</a>` : ""}</p>` : ""}
    ${p.mensagem_original ? `<details class="mt"><summary>Mensagem original</summary><p>${esc(p.mensagem_original)}</p></details>` : ""}
    <div class="row wrap-row mt">${["novo", "aguardando_lote", "pronto_para_entrega"].includes(p.status) ? `<button class="btn sm ghost" id="cancelar">Cancelar</button>` : ""}
      ${p.status === "pronto_para_entrega" ? `<button class="btn sm dark" id="moto">Chamar motoboy</button>` : ""}
      ${!["entregue", "cancelado"].includes(p.status) ? `<button class="btn sm" id="ent">Marcar entregue</button>` : ""}</div>`);
  const fecha = () => { o.remove(); rotear(); };
  $("#cancelar", o)?.addEventListener("click", (e) => acao(e.target, () => api(`/pedidos/${id}/cancelar`, { body: {} }), "Pedido cancelado").then(fecha));
  $("#moto", o)?.addEventListener("click", (e) => acao(e.target, () => api(`/pedidos/${id}/motoboy`, { body: {} }), "Motoboy chamado!").then(fecha));
  $("#ent", o)?.addEventListener("click", (e) => acao(e.target, () => api(`/pedidos/${id}/entregue`, { body: {} }), "Entregue!").then(fecha));
}
async function novoPedido() {
  const o = folha(`<h2>Novo pedido</h2><p><small>Cole a mensagem da cliente (ou fale com a Bia pelo microfone) que a IA monta o pedido.</small></p>
    <label>Cliente</label><input id="nc" placeholder="Nome"><input id="nw" class="mt" inputmode="tel" placeholder="WhatsApp da cliente"><input id="ne" class="mt" placeholder="Endereço de entrega">
    <label>Mensagem / itens</label><textarea id="nt" placeholder="Ex.: quero 2 Nativa SPA e 1 Lily"></textarea>
    <button class="btn primary block mt" id="ok">Criar pedido com IA</button>`);
  $("#ok", o).onclick = (e) => acao(e.target, async () => {
    const r = await api("/pedidos/interpretar", { body: { texto: $("#nt", o).value, cliente: { nome: $("#nc", o).value, whatsapp: $("#nw", o).value, endereco: $("#ne", o).value } } });
    if (!r.criado) throw new Error("Não identifiquei produtos do catálogo. Escreva o nome dos produtos.");
    o.remove(); toast("Pedido criado! A IA já está cuidando."); rotear();
  });
}

// ---------------- Agentes ----------------
let abaAgente = "visao";
async function telaAgentes(sub) {
  if (sub) abaAgente = sub;
  const abas = { visao: "Visão geral", marketing: "Marketing", comercial: "Comercial", operacoes: "Operações" };
  tela.innerHTML = `<h1>Seus agentes de IA</h1><div class="tabs">${Object.entries(abas).map(([k, v]) => `<button class="tab ${k === abaAgente ? "on" : ""}" data-a="${k}">${v}</button>`).join("")}</div><div id="ag"></div>`;
  tela.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.a === "visao" ? "#agentes" : `#agentes/${b.dataset.a}`; }));
  await { visao: agVisao, marketing: agMarketing, comercial: agComercial, operacoes: agOperacoes }[abaAgente]();
}
async function agVisao() {
  const a = await api("/agentes");
  const card = (icone, titulo, linhas, link) => `<div class="card"><div class="row between"><h2>${icone} ${titulo}</h2><a href="${link}">abrir</a></div><div class="grid3">${linhas.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("")}</div></div>`;
  $("#ag").innerHTML =
    card("📣", "Marketing", [[a.marketing.agendados, "posts agendados"], [a.marketing.publicados, "publicados"], [a.marketing.campanhas, "campanhas"]], "#agentes/marketing") +
    card("🤝", "Comercial", [[a.comercial.leads_ativos, "leads em follow-up"], [a.comercial.propostas, "propostas"], [a.comercial.convertidos, "convertidos"]], "#agentes/comercial") +
    card("⚙️", "Operações", [[a.operacoes.em_andamento, "pedidos ativos"], [a.operacoes.tickets_abertos, "tickets abertos"], [a.operacoes.entregues, "entregues"]], "#agentes/operacoes") +
    card("💰", "Financeiro", [[a.financeiro.cobrancas_abertas, "cobranças"], [a.financeiro.conciliados, "conciliados"], [a.financeiro.pendentes_conciliacao, "a conciliar"]], "#financeiro") +
    `<div class="card"><h2>Atividade recente</h2><ul class="list feed">${a.eventos.map((e) => `<li><span class="dot"></span><div>${esc(e.mensagem)}<br><small>${horaBR(e.criado_em)}</small></div></li>`).join("")}</ul></div>`;
}

async function agMarketing() {
  const m = await api("/marketing");
  const TIPOS = { roteiro_reels: "🎬 Roteiro de Reels", anuncio: "🎯 Anúncio", stories: "📱 Stories", carrossel: "🖼️ Carrossel" };
  $("#ag").innerHTML = `
    <div class="card"><div class="row between"><h2>Instagram</h2>${m.instagram ? `<span class="pill ok">conectado</span>` : `<button class="btn sm dark" id="ig">Conectar</button>`}</div>
      <button class="btn primary block mt" id="gerar">Criar posts da semana</button>
      <ul class="list mt">${m.posts.map((p) => `<li class="prod"><img src="${esc(p.imagem)}" alt=""><div style="flex:1"><div class="row between"><small>${horaBR(p.agendado_para)}</small><span class="pill ${p.status === "publicado" ? "ok" : p.status === "erro" ? "crit" : "rose"}">${esc(p.status)}</span></div>
        <small>${esc(p.objetivo || "")} • ${esc(p.produto_nome || "")}</small><p style="font-size:.9rem;white-space:pre-wrap">${esc(p.legenda.slice(0, 160))}${p.legenda.length > 160 ? "…" : ""}</p>
        ${p.status === "agendado" ? `<div class="row"><button class="btn sm" data-edit="${p.id}">Editar</button><button class="btn sm ghost" data-pub="${p.id}">Publicar agora</button></div>` : ""}</div></li>`).join("") || `<li class="empty">Sem posts ainda.</li>`}</ul></div>
    <div class="card"><h2>Criar conteúdo</h2><div class="grid2">${Object.entries(TIPOS).map(([k, v]) => `<button class="btn" data-tipo="${k}">${v}</button>`).join("")}</div>
      <input id="tema" class="mt" placeholder="Tema (opcional): ex. Dia das Mães, lançamento, Natal">
      <div class="mt">${m.conteudos.map((c) => `<details class="card" style="box-shadow:none"><summary>${TIPOS[c.tipo] || ""} — ${esc(c.titulo)}</summary>${c.secoes.map((s) => `<div class="sec"><b>${esc(s.titulo)}</b>${esc(s.texto)}</div>`).join("")}
        <button class="btn sm mt" data-copytxt="${esc(c.secoes.map((s) => s.titulo + ": " + s.texto).join("\n"))}">Copiar</button></details>`).join("")}</div></div>
    <div class="card"><div class="row between"><h2>Campanhas e combos</h2><button class="btn sm dark" id="sug">Sugerir</button></div>
      <p><small>Datas próximas: ${m.datas.map((d) => `${esc(d.nome)} (${d.data.slice(8, 10)}/${d.data.slice(5, 7)})`).join(" • ") || "—"}</small></p>
      <ul class="list">${m.campanhas.map((c) => `<li><div class="row between"><b>${esc(c.nome)}</b><span class="pill ${c.status === "sugerida" ? "rose" : "ok"}">${esc(c.status)}</span></div>
        <small>${esc(c.descricao || "")}</small><p style="font-size:.9rem">${esc(c.mensagem)}</p>
        ${c.resultado.enviados ? `<small>Enviada a ${c.resultado.enviados} • ${c.resultado.pedidos ?? 0} pedidos • ${brl(c.resultado.receita || 0)}</small>` : ""}
        ${c.status === "sugerida" ? `<button class="btn sm primary" data-env="${c.id}">Enviar para a lista de transmissão</button>` : ""}</li>`).join("") || `<li class="empty">Toque em Sugerir.</li>`}</ul></div>`;
  $("#ig")?.addEventListener("click", (e) => acao(e.target, conectarInstagram).then(agMarketing));
  $("#gerar").onclick = (e) => acao(e.target, () => api("/marketing/posts/gerar", { body: {} }), (r) => `${r.length} posts agendados!`).then(agMarketing);
  $("#sug").onclick = (e) => acao(e.target, () => api("/marketing/campanhas/sugerir", { body: {} }), (r) => `${r.length} campanhas sugeridas`).then(agMarketing);
  document.querySelectorAll("[data-tipo]").forEach((b) => (b.onclick = () => acao(b, () => api("/marketing/conteudos", { body: { tipo: b.dataset.tipo, tema: $("#tema").value } }), "Conteúdo pronto!").then(agMarketing)));
  document.querySelectorAll("[data-env]").forEach((b) => (b.onclick = () => acao(b, () => api(`/marketing/campanhas/${b.dataset.env}/enviar`, { body: {} }), (r) => `Enviada para ${r.enviados} clientes`).then(agMarketing)));
  document.querySelectorAll("[data-pub]").forEach((b) => (b.onclick = () => acao(b, () => api("/marketing/posts/publicar", { body: { id: b.dataset.pub } }), "Publicado!").then(agMarketing)));
  document.querySelectorAll("[data-copytxt]").forEach((b) => (b.onclick = () => copiar(b.dataset.copytxt)));
  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
    const post = m.posts.find((p) => p.id === b.dataset.edit);
    const o = folha(`<h2>Editar post</h2><textarea id="leg" style="min-height:200px">${esc(post.legenda)}</textarea><button class="btn primary block mt" id="sv">Salvar</button>`);
    $("#sv", o).onclick = (e) => acao(e.target, () => api(`/marketing/posts/${post.id}`, { method: "PUT", body: { legenda: $("#leg", o).value } }), "Salvo").then(() => { o.remove(); agMarketing(); });
  }));
}

async function agComercial() {
  const c = await api("/comercial");
  const TEMP = { quente: "crit", morno: "warn", frio: "" };
  $("#ag").innerHTML = `
    <div class="card"><h2>Leads (triagem automática)</h2><p><small>Cada contato que chega no WhatsApp/Instagram é pontuado pela IA e entra numa cadência de follow-up.</small></p>
      <ul class="list">${c.leads.map((l) => `<li><div class="row between"><b>${esc(l.nome)}</b><span class="pill ${TEMP[l.temperatura]}">${esc(l.temperatura)} • ${l.score}</span></div>
        <small>${esc(l.interesse || "")}</small><div class="row between mt"><small>${esc(l.estagio)} • ${l.proxima_acao_em ? "próximo follow-up " + dataBR(l.proxima_acao_em) : "sem follow-up"}</small>
        ${["convertido", "perdido"].includes(l.estagio) ? "" : `<button class="btn sm" data-prop="${l.id}" data-nome="${esc(l.nome)}">Proposta</button>`}</div></li>`).join("") || `<li class="empty">Sem leads ainda.</li>`}</ul>
      <button class="btn ghost block mt" id="novolead">+ Adicionar lead</button></div>
    <div class="card"><h2>Propostas comerciais</h2><ul class="list">${c.propostas.map((p) => `<li><details><summary>${esc(p.titulo)} — ${brl(p.total)} <span class="pill ${p.status === "enviada" ? "ok" : "rose"}">${esc(p.status)}</span></summary>
      <p style="white-space:pre-wrap;font-size:.9rem">${esc(p.texto)}</p>${p.status !== "enviada" ? `<button class="btn sm primary" data-envp="${p.id}">Enviar no WhatsApp</button>` : ""}</details></li>`).join("") || `<li class="empty">Crie a partir de um lead.</li>`}</ul></div>
    <div class="card"><h2>Análise de conversas e ligações</h2><p><small>Cole a conversa do WhatsApp ou a transcrição de uma ligação. A IA aponta objeções, oportunidades e a próxima mensagem.</small></p>
      <input id="acontato" placeholder="Com quem foi a conversa?"><textarea id="atexto" class="mt" placeholder="Cole aqui a conversa…"></textarea>
      <button class="btn dark block mt" id="analisar">Analisar</button>
      <div id="analises">${c.analises.map(cardAnalise).join("")}</div></div>
    <div class="card"><h2>Cadências de follow-up</h2>${Object.entries(c.cadencias).map(([k, passos]) => `<details><summary>${k.replace("lead_", "Lead ")}</summary><ul class="list">${passos.map((p) => `<li><small>Dia ${p.dia}</small><br>${esc(p.texto)}</li>`).join("")}</ul></details>`).join("")}</div>`;
  document.querySelectorAll("[data-prop]").forEach((b) => (b.onclick = () => {
    const o = folha(`<h2>Proposta para ${esc(b.dataset.nome)}</h2><label>Objetivo</label><input id="pobj" placeholder="Ex.: kit Dia das Mães para equipe"><label>Orçamento (R$)</label><input id="porc" inputmode="decimal"><label>Desconto (%)</label><input id="pdesc" inputmode="numeric" value="0"><button class="btn primary block mt" id="pok">Gerar proposta</button>`);
    $("#pok", o).onclick = (e) => acao(e.target, () => api("/comercial/propostas", { body: { leadId: b.dataset.prop, objetivo: $("#pobj", o).value, orcamento: Number($("#porc", o).value) || undefined, descontoPct: Number($("#pdesc", o).value) || 0 } }), "Proposta pronta!").then(() => { o.remove(); agComercial(); });
  }));
  document.querySelectorAll("[data-envp]").forEach((b) => (b.onclick = () => acao(b, () => api(`/comercial/propostas/${b.dataset.envp}/enviar`, { body: {} }), "Proposta enviada!").then(agComercial)));
  $("#analisar").onclick = (e) => acao(e.target, () => api("/comercial/analises", { body: { contato: $("#acontato").value, transcricao: $("#atexto").value } })).then((a) => { if (a) $("#analises").insertAdjacentHTML("afterbegin", cardAnalise(a)); });
  $("#novolead").onclick = () => {
    const o = folha(`<h2>Novo lead</h2><input id="ln" placeholder="Nome"><input id="lw" class="mt" placeholder="WhatsApp"><input id="li" class="mt" placeholder="Interesse"><button class="btn primary block mt" id="lok">Salvar</button>`);
    $("#lok", o).onclick = (e) => acao(e.target, () => api("/comercial/leads", { body: { nome: $("#ln", o).value, whatsapp: $("#lw", o).value, interesse: $("#li", o).value, score: 60 } }), "Lead salvo — cadência iniciada").then(() => { o.remove(); agComercial(); });
  };
}
function cardAnalise(a) {
  const x = a.analise;
  return `<details class="card mt" style="box-shadow:none"><summary>${esc(a.contato || "Conversa")} — ${esc(x.sentimento)} • ${x.probabilidade_compra}% de chance</summary>
    <p>${esc(x.resumo)}</p>${[["Objeções", x.objecoes], ["Oportunidades", x.oportunidades], ["Pontos fortes", x.pontos_fortes], ["O que melhorar", x.melhorias]].map(([t, l]) => l?.length ? `<div class="sec"><b>${t}</b>${l.map(esc).join("<br>")}</div>` : "").join("")}
    <div class="sec"><b>Próxima mensagem sugerida</b>${esc(x.proxima_mensagem)}</div><button class="btn sm" onclick="copiar(this.previousElementSibling.lastChild.textContent)">Copiar mensagem</button></details>`;
}

async function agOperacoes() {
  const o = await api("/operacoes");
  $("#ag").innerHTML = `
    <div class="card"><h2>Saúde da carteira</h2><div class="grid2">
      <div class="stat"><b>${o.saude.ativas}</b><span>clientes ativas (30 dias)</span></div><div class="stat"><b>${o.saude.em_risco}</b><span>em risco (31–60 dias)</span></div>
      <div class="stat"><b>${o.saude.inativas}</b><span>inativas (+60 dias)</span></div><div class="stat"><b>${o.saude.nps ?? "—"}</b><span>NPS</span></div></div>
      <p class="mt"><small>A IA faz o onboarding de cada nova cliente, pede avaliação (NPS) após a entrega e avisa quando o produto deve estar acabando.</small></p></div>
    <div class="card"><div class="row between"><h2>Suporte e criticidade</h2><button class="btn sm" id="mon">Verificar agora</button></div>
      <p><small>SLA: ${Object.entries(o.sla).map(([k, v]) => `${k} ${v}h`).join(" • ")}. Sem resposta no prazo, sobe de nível.</small></p>
      <ul class="list">${o.tickets.map((t) => `<li><div class="row between"><span class="pill ${t.status === "resolvido" ? "ok" : CRIT[t.criticidade][1]}">${t.status === "resolvido" ? "Resolvido" : t.criticidade + " " + CRIT[t.criticidade][0]}</span><small>${horaBR(t.criado_em)}</small></div>
        <b>${esc(t.assunto)}</b><br><small>${esc(t.descricao || "")}</small>
        ${t.resposta ? `<div class="sec"><b>Resposta da IA</b>${esc(t.resposta)}</div>` : ""}
        ${t.status !== "resolvido" ? `<button class="btn sm ok mt" data-res="${t.id}">Marcar resolvido</button>` : ""}</li>`).join("") || `<li class="empty">Nenhum chamado. Operação tranquila ✨</li>`}</ul></div>`;
  $("#mon").onclick = (e) => acao(e.target, () => api("/operacoes/monitorar", { body: {} }), (r) => `${r.novos} novo(s) alerta(s)`).then(agOperacoes);
  document.querySelectorAll("[data-res]").forEach((b) => (b.onclick = () => acao(b, () => api(`/operacoes/tickets/${b.dataset.res}/resolver`, { method: "PUT", body: {} }), "Resolvido").then(agOperacoes)));
}

// ---------------- Financeiro ----------------
async function telaFinanceiro() {
  const f = await api("/financeiro");
  const d = f.dre;
  const ult = f.serie[f.serie.length - 1], pen = f.serie[f.serie.length - 2];
  const cresc = pen?.receita ? Math.round(((ult.receita - pen.receita) / pen.receita) * 100) : null;
  tela.innerHTML = `
    <h1>Financeiro</h1>
    <div class="grid2">
      <div class="stat"><span>Vendas no mês</span><b>${brl(d.receitaBruta)}</b>${cresc !== null ? `<span>${cresc >= 0 ? "▲" : "▼"} ${Math.abs(cresc)}% vs mês anterior</span>` : ""}</div>
      <div class="stat"><span>Lucro líquido</span><b>${brl(d.lucroLiquido)}</b><span>margem ${d.margemLiquida}%</span></div>
      <div class="stat"><span>Saldo hoje</span><b>${brl(f.caixa.saldoAtual)}</b></div>
      <div class="stat"><span>Ticket médio</span><b>${brl(d.ticketMedio)}</b><span>${d.pedidos} pedidos</span></div>
    </div>
    <div class="card mt"><h2>Evolução (6 meses)</h2><div class="chart" id="g1"></div>
      <details class="mt"><summary>Ver tabela</summary><table class="dre">${f.serie.map((s) => `<tr><td>${s.mes}</td><td>${brl(s.receita)} • lucro ${brl(s.lucro)}</td></tr>`).join("")}</table></details></div>
    <div class="card"><h2>Fluxo de caixa — próximos 30 dias</h2><div class="chart" id="g2"></div>
      <p class="row between"><small>Saldo projetado</small><b>${brl(f.caixa.saldoProjetado)}</b></p>${f.caixa.alerta ? `<p><span class="pill crit">Alerta</span> ${esc(f.caixa.alerta)}</p>` : ""}</div>
    <div class="card"><h2>DRE — ${esc(d.mes)}</h2><table class="dre">
      <tr><td>Receita bruta de vendas</td><td>${brl(d.receitaBruta)}</td></tr><tr><td>(−) Custo das mercadorias (CMV)</td><td>${brl(-d.cmv)}</td></tr>
      <tr class="total"><td>Lucro bruto (${d.margemBruta}%)</td><td>${brl(d.lucroBruto)}</td></tr>
      ${d.despesas.map((x) => `<tr><td>(−) ${esc(x.categoria)}</td><td>${brl(-x.valor)}</td></tr>`).join("")}
      <tr class="total"><td>Lucro líquido (${d.margemLiquida}%)</td><td>${brl(d.lucroLiquido)}</td></tr></table>
      <button class="btn block mt" id="rel">📊 Relatório do mês com análise da IA</button><div id="relout"></div></div>
    <div class="card"><h2>Cobrança das clientes</h2><p><small>A IA envia o Pix junto do pedido e lembretes gentis em D+2, D+5 e D+10.</small></p>
      <ul class="list">${f.cobrancas.map((c) => `<li class="row between"><div><b>${esc(c.nome)}</b><br><small>${brl(c.valor)} • ${c.lembretes} lembrete(s)</small></div><button class="btn sm ok" data-cpg="${c.id}">Recebi</button></li>`).join("") || `<li class="empty">Nada a receber 🎉</li>`}</ul></div>
    <div class="card"><h2>Conciliação bancária</h2><p><small>Exporte o extrato do app do seu banco (OFX ou CSV) e envie aqui. A IA casa cada Pix com a cliente certa e cada débito com o boleto da marca.</small></p>
      <input type="file" id="arq" accept=".ofx,.csv,.txt"><button class="btn dark block mt" id="imp">Importar extrato</button>
      <ul class="list mt">${f.extrato.map((e) => `<li class="row between"><div><small>${e.data}</small><br>${esc(e.descricao)}</div><div style="text-align:right"><b>${brl(e.valor)}</b><br>
        ${e.status === "conciliado" ? `<span class="pill ok">conciliado</span>` : `<select data-cls="${e.id}" style="min-height:34px;padding:4px"><option value="">Classificar…</option>${["Embalagens e brindes", "Combustível", "Marketing/anúncios", "Retirada pessoal", "Outros"].map((o) => `<option>${o}</option>`).join("")}</select>`}</div></li>`).join("")}</ul></div>
    <div class="card"><h2>Lançar despesa</h2><div class="grid2"><input id="dval" inputmode="decimal" placeholder="Valor"><select id="dcat">${["Embalagens e brindes", "Marketing/anúncios", "Combustível", "Outros"].map((o) => `<option>${o}</option>`).join("")}</select></div>
      <input id="ddesc" class="mt" placeholder="Descrição"><button class="btn block mt" id="dok">Lançar</button></div>
    <div class="card"><h2>🔒 Recebimento</h2><p><small>Sua chave Pix: <b>${esc(conta.chave_pix || "não cadastrada")}</b>. Alterar exige código no WhatsApp. A IA nunca faz pagamentos ou transferências.</small></p>
      <input id="npix" placeholder="Nova chave Pix"><button class="btn block mt" id="spix">Alterar chave Pix</button></div>`;
  graficoBarras($("#g1"), f.serie.map((s) => s.mes), [
    { nome: "Receita", cor: "var(--s-receita)", valores: f.serie.map((s) => s.receita) },
    { nome: "Lucro", cor: "var(--s-lucro)", valores: f.serie.map((s) => s.lucro) },
  ]);
  graficoLinha($("#g2"), f.caixa.serie, f.caixa.saldoAtual);
  $("#rel").onclick = (e) => acao(e.target, () => api("/financeiro/relatorio")).then((r) => {
    if (!r) return;
    $("#relout").innerHTML = `<div class="sec mt"><b>Resumo</b>${esc(r.analise.resumo)}</div><div class="sec"><b>Destaques</b>${r.analise.destaques.map(esc).join("<br>")}</div><div class="sec"><b>Ações que a IA vai aplicar</b>${r.analise.acoes.map(esc).join("<br>")}</div>`;
  });
  document.querySelectorAll("[data-cpg]").forEach((b) => (b.onclick = () => acao(b, () => api(`/financeiro/cobrancas/${b.dataset.cpg}/paga`, { body: {} }), "Recebimento registrado").then(telaFinanceiro)));
  document.querySelectorAll("[data-cls]").forEach((s) => (s.onchange = () => s.value && api(`/financeiro/extrato/${s.dataset.cls}/classificar`, { body: { categoria: s.value } }).then(() => { toast("Classificado"); telaFinanceiro(); })));
  $("#imp").onclick = (e) => acao(e.target, async () => {
    const arq = $("#arq").files[0];
    if (!arq) throw new Error("Escolha o arquivo do extrato");
    return api("/financeiro/extrato", { body: { conteudo: await arq.text() } });
  }, (r) => `${r.importados} importados • ${r.conciliados} conciliados`).then(telaFinanceiro);
  $("#dok").onclick = (e) => acao(e.target, () => api("/financeiro/lancamentos", { body: { valor: Number($("#dval").value.replace(",", ".")), categoria: $("#dcat").value, descricao: $("#ddesc").value } }), "Lançado").then(telaFinanceiro);
  $("#spix").onclick = (e) => acao(e.target, () => api("/conta/recebimento", { method: "PUT", body: { chave_pix: $("#npix").value } }), "Chave Pix alterada").then(async () => { conta = await api("/conta"); telaFinanceiro(); });
}

// ---------------- Mais: catálogo, clientes, integrações, conta ----------------
let abaMais = "catalogo";
async function telaMais(sub) {
  if (sub) abaMais = sub;
  const abas = { catalogo: "Catálogo", clientes: "Clientes", integracoes: "Integrações", conta: "Conta" };
  tela.innerHTML = `<div class="tabs">${Object.entries(abas).map(([k, v]) => `<button class="tab ${k === abaMais ? "on" : ""}" data-m="${k}">${v}</button>`).join("")}</div><div id="mais"></div>`;
  tela.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { location.hash = `#mais/${b.dataset.m}`; }));
  await { catalogo: maisCatalogo, clientes: maisClientes, integracoes: maisIntegracoes, conta: maisConta }[abaMais]();
}
async function maisCatalogo() {
  const prods = await api("/catalogo");
  const marcas = [...new Set(prods.map((p) => p.fornecedor))];
  $("#mais").innerHTML = `
    <div class="row between"><h1>Catálogo</h1><button class="btn sm primary" id="add">+ Produto</button></div>
    <p><small>${prods.length} produtos • ${marcas.join(", ") || "nenhuma marca"}. Estoque > 0 vira "pronta entrega" (sai direto pro motoboy).</small></p>
    <div class="row wrap-row">${marcas.filter((m) => m !== "outra").map((m) => `<button class="btn sm" data-sync="${m}">↻ Sincronizar ${esc(m)}</button>`).join("")}<button class="btn sm ghost" id="csv">Importar CSV</button></div>
    <div class="card mt"><ul class="list">${prods.map((p) => `<li class="prod"><img src="${esc(p.imagem || "/assets/produtos/creme.svg")}" alt=""><div style="flex:1"><b style="font-size:.92rem">${esc(p.nome)}</b><br>
      <small>${esc(p.fornecedor)} • ${brl(p.preco_catalogo)} • lucro ${brl(p.preco_catalogo - p.preco_custo)}</small></div>
      <input type="number" min="0" value="${p.estoque}" data-est="${p.id}" style="width:64px;min-height:38px;padding:6px" aria-label="estoque"></li>`).join("") || `<li class="empty">Conecte uma marca em Integrações ou adicione produtos.</li>`}</ul></div>`;
  document.querySelectorAll("[data-sync]").forEach((b) => (b.onclick = () => acao(b, () => api(`/integracoes/fornecedor/${b.dataset.sync}/sincronizar`, { body: {} }), (r) => `${r.produtos} produtos atualizados`).then(maisCatalogo)));
  document.querySelectorAll("[data-est]").forEach((i) => (i.onchange = () => api(`/catalogo/${i.dataset.est}`, { method: "PUT", body: { estoque: Number(i.value) } }).then(() => toast("Estoque atualizado"))));
  $("#add").onclick = () => {
    const o = folha(`<h2>Novo produto</h2><input id="pn" placeholder="Nome"><div class="grid2 mt"><input id="pp" inputmode="decimal" placeholder="Preço de venda"><input id="pc" inputmode="decimal" placeholder="Seu custo (opcional)"></div>
      <div class="grid2 mt"><input id="pcat" placeholder="Categoria"><input id="pe" inputmode="numeric" placeholder="Estoque"></div><input id="pm" class="mt" placeholder="Marca (ex.: Jequiti, Mary Kay)"><button class="btn primary block mt" id="pok">Salvar</button>`);
    $("#pok", o).onclick = (e) => acao(e.target, () => api("/catalogo", { body: { nome: $("#pn", o).value, preco_catalogo: Number($("#pp", o).value.replace(",", ".")), preco_custo: Number($("#pc", o).value.replace(",", ".")) || undefined, categoria: $("#pcat", o).value, estoque: Number($("#pe", o).value) || 0, fornecedor: $("#pm", o).value.toLowerCase() || "outra" } }), "Produto salvo").then(() => { o.remove(); maisCatalogo(); });
  };
  $("#csv").onclick = () => {
    const o = folha(`<h2>Importar planilha</h2><p><small>Uma linha por produto: <b>nome; preço; custo; categoria; estoque; marca</b></small></p><textarea id="cv" style="min-height:180px" placeholder="Batom Matte Vermelho; 39,90; 27,90; Maquiagem; 3; jequiti"></textarea><button class="btn primary block mt" id="cok">Importar</button>`);
    $("#cok", o).onclick = (e) => acao(e.target, () => api("/catalogo/importar", { body: { csv: $("#cv", o).value } }), (r) => `${r.importados} produtos importados`).then(() => { o.remove(); maisCatalogo(); });
  };
}
async function maisClientes() {
  const c = await api("/clientes");
  const S = { ativa: "ok", em_risco: "warn", inativa: "crit", nova: "rose" };
  $("#mais").innerHTML = `<div class="row between"><h1>Clientes</h1><button class="btn sm primary" id="nc">+ Cliente</button></div>
    <div class="card"><ul class="list">${c.clientes.map((x) => `<li><div class="row between"><b>${esc(x.nome)}</b><span class="pill ${S[x.saude]}">${esc(x.saude.replace("_", " "))}</span></div>
      <small>${x.compras} compras • ${brl(x.total_gasto)}${x.dias_sem_comprar !== null ? ` • última há ${x.dias_sem_comprar} dias` : ""}${x.nps !== null ? ` • NPS ${x.nps}` : ""}</small></li>`).join("") || `<li class="empty">Suas clientes aparecem aqui automaticamente.</li>`}</ul></div>`;
  $("#nc").onclick = () => {
    const o = folha(`<h2>Nova cliente</h2><input id="cn" placeholder="Nome"><input id="cw" class="mt" placeholder="WhatsApp"><input id="ce" class="mt" placeholder="Endereço"><label>Aniversário</label><input id="ca" type="date"><button class="btn primary block mt" id="cok">Salvar e dar boas-vindas</button>`);
    $("#cok", o).onclick = (e) => acao(e.target, () => api("/clientes", { body: { nome: $("#cn", o).value, whatsapp: $("#cw", o).value, endereco: $("#ce", o).value, aniversario: $("#ca", o).value || undefined } }), "Cliente salva — boas-vindas enviadas").then(() => { o.remove(); maisClientes(); });
  };
}
async function maisIntegracoes() {
  const i = await api("/integracoes");
  const con = (tipo) => i.conectadas.filter((c) => c.tipo === tipo);
  const linha = (titulo, lista, botao) => `<div class="card"><div class="row between"><h2>${titulo}</h2>${lista.length ? `<span class="pill ok">conectado</span>` : `<span class="pill">desconectado</span>`}</div>
    ${lista.map((c) => `<p class="row between"><small>${esc(c.meta.nome || c.meta.usuario || c.meta.numero || c.provedor)}</small><button class="btn sm ghost" data-del="${c.id}">Desconectar</button></p>`).join("")}${botao}</div>`;
  $("#mais").innerHTML = `<h1>Integrações</h1><button class="btn primary block" id="auto">✨ Deixa com a IA configurar tudo</button><div class="mt"></div>
    ${linha("🛍️ Marcas (catálogo e pedidos)", con("fornecedor"), formFornecedor())}
    ${linha("💬 WhatsApp Business", con("whatsapp"), con("whatsapp").length ? "" : `<button class="btn dark block" id="cw">Conectar WhatsApp</button>`)}
    ${linha("📸 Instagram", con("instagram"), con("instagram").length ? "" : `<button class="btn dark block" id="ci">Conectar Instagram</button>`)}
    ${linha("🛵 Motoboy", con("motoboy"), con("motoboy").length ? "" : `<button class="btn dark block" id="cm">Ativar entregas por motoboy</button>`)}
    <p class="center"><small>${i.disponivel.demo ? "Modo demonstração: integrações sem credenciais oficiais são simuladas." : ""}</small></p>`;
  ligarFormFornecedor($("#mais"), maisIntegracoes);
  $("#auto").onclick = () => { location.hash = "#configurar"; };
  $("#cw")?.addEventListener("click", (e) => acao(e.target, conectarWhatsapp).then(maisIntegracoes));
  $("#ci")?.addEventListener("click", (e) => acao(e.target, conectarInstagram).then(maisIntegracoes));
  $("#cm")?.addEventListener("click", (e) => acao(e.target, () => api("/integracoes/motoboy", { body: {} }), "Motoboy ativado").then(maisIntegracoes));
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => confirm("Desconectar esta integração?") && acao(b, () => api(`/integracoes/${b.dataset.del}`, { method: "DELETE" }), "Desconectado").then(maisIntegracoes)));
}
async function maisConta() {
  conta = await api("/conta");
  const c = conta.config;
  const sw = (k, t, d) => `<div class="switch"><div><b>${t}</b><br><small>${d}</small></div><input type="checkbox" data-cfg="${k}" ${c[k] !== false ? "checked" : ""}></div>`;
  $("#mais").innerHTML = `<h1>Minha conta</h1>
    <div class="card"><div class="switch"><div><b>Piloto automático</b><br><small>A IA responde clientes e executa as rotinas sozinha</small></div><input type="checkbox" id="piloto" ${conta.piloto_automatico ? "checked" : ""}></div>
      ${sw("autoMotoboy", "Chamar motoboy sozinha", "Quando o pedido estiver pronto")}${sw("autoInstagram", "Postar no Instagram sozinha", "Calendário semanal automático")}
      ${sw("autoCampanhas", "Campanha semanal automática", "Toda segunda, para a lista de transmissão")}${sw("respostaAutomatica", "Responder conversas", "Dúvidas e mensagens gerais")}</div>
    <div class="card"><label>Nome</label><input id="cnome" value="${esc(conta.nome)}"><label>Cidade</label><input id="ccid" value="${esc(conta.cidade || "")}">
      <label>Endereço de coleta (motoboy)</label><input id="cend" value="${esc(conta.endereco_coleta || "")}">
      <label>Tom de voz das mensagens</label><input id="ctom" value="${esc(c.tom || "")}"><label>Horário da lista diária</label><input id="chora" type="number" min="5" max="12" value="${c.horaLista ?? 8}">
      <button class="btn primary block mt" id="salvar">Salvar</button></div>
    <div class="card"><p><small>Plano ${esc(conta.plano || "-")} • ${esc(conta.assinatura_status)} até ${conta.assinatura_ate ? new Date(conta.assinatura_ate).toLocaleDateString("pt-BR") : "-"} • IA ${conta.ia ? "Claude ativa" : "modo regras (sem chave de IA)"}</small></p>
      <a class="btn block" href="/assinar">Renovar / trocar plano</a><button class="btn ghost block mt" id="sair">Sair</button></div>`;
  $("#piloto").onchange = (e) => api("/conta", { method: "PUT", body: { piloto_automatico: e.target.checked } }).then(() => toast("Salvo"));
  document.querySelectorAll("[data-cfg]").forEach((i) => (i.onchange = () => api("/conta", { method: "PUT", body: { config: { [i.dataset.cfg]: i.checked } } }).then(() => toast("Salvo"))));
  $("#salvar").onclick = (e) => acao(e.target, () => api("/conta", { method: "PUT", body: { nome: $("#cnome").value, cidade: $("#ccid").value, endereco_coleta: $("#cend").value, config: { tom: $("#ctom").value, horaLista: Number($("#chora").value) } } }), "Salvo");
  $("#sair").onclick = async () => { await api("/auth/sair", { body: {} }); mostrarLogin(); };
}

// ---------------- Assistente por voz ----------------
const historicoVoz = [];
function abrirAssistente() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const o = folha(`<div class="row between"><h2>Fale com a Bia 🎙️</h2><button class="btn sm ghost" id="fechar">Fechar</button></div>
    <div id="conv" style="min-height:120px;max-height:40vh;overflow:auto">${historicoVoz.map((m) => `<div class="bubble ${m.de}">${esc(m.texto)}</div>`).join("") || `<p class="muted center">Toque no microfone e fale. Ex.: "O que eu tenho que entregar hoje?", "Cria posts pra semana", "Quanto eu lucrei esse mês?", "Anota um pedido da Ana: 1 Malbec"</p>`}</div>
    <button class="mic" id="mic" aria-label="Falar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
    <p class="center muted" id="estado">${Rec ? "Toque para falar" : "Seu navegador não tem reconhecimento de voz — digite abaixo."}</p>
    <div class="row"><input id="txt" placeholder="Ou digite aqui…"><button class="btn primary" id="env">Enviar</button></div>`);
  const conv = $("#conv", o), estado = $("#estado", o), mic = $("#mic", o);
  $("#fechar", o).onclick = () => { speechSynthesis?.cancel(); o.remove(); };
  const add = (de, texto) => {
    if (!historicoVoz.length) conv.innerHTML = "";
    historicoVoz.push({ de, texto });
    conv.insertAdjacentHTML("beforeend", `<div class="bubble ${de}">${esc(texto)}</div>`);
    conv.scrollTop = conv.scrollHeight;
  };
  const falar = (t) => {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "pt-BR"; u.rate = 1.05;
    const voz = speechSynthesis.getVoices().find((v) => v.lang === "pt-BR" && /female|luciana|maria|francisca|google/i.test(v.name)) || speechSynthesis.getVoices().find((v) => v.lang.startsWith("pt"));
    if (voz) u.voice = voz;
    speechSynthesis.speak(u);
  };
  const enviar = async (texto) => {
    if (!texto.trim()) return;
    add("eu", texto);
    estado.textContent = "Pensando…";
    try {
      const r = await api("/assistente", { body: { texto, historico: historicoVoz.slice(0, -1) } });
      add("ia", r.resposta); falar(r.resposta);
      estado.textContent = "Toque para falar de novo";
      if (r.tela) setTimeout(() => irPara(r.tela), 600); else rotear();
    } catch (e) { estado.textContent = e.message; }
  };
  $("#env", o).onclick = () => { enviar($("#txt", o).value); $("#txt", o).value = ""; };
  $("#txt", o).onkeydown = (e) => { if (e.key === "Enter") $("#env", o).click(); };
  if (!Rec) { mic.disabled = true; return; }
  const rec = new Rec();
  rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false;
  let final = "";
  rec.onresult = (ev) => {
    final = [...ev.results].map((r) => r[0].transcript).join(" ");
    estado.textContent = `"${final}"`;
  };
  rec.onend = () => { mic.classList.remove("ouvindo"); if (final) enviar(final); final = ""; };
  rec.onerror = (ev) => { mic.classList.remove("ouvindo"); estado.textContent = ev.error === "not-allowed" ? "Permita o microfone nas configurações do navegador." : "Não entendi, tente de novo."; };
  mic.onclick = () => { speechSynthesis?.cancel(); try { rec.start(); mic.classList.add("ouvindo"); estado.textContent = "Ouvindo…"; } catch { rec.stop(); } };
  mic.click();
}
function irPara(t) {
  const mapa = { hoje: "#hoje", pedidos: "#pedidos", financeiro: "#financeiro", marketing: "#agentes/marketing", comercial: "#agentes/comercial", operacoes: "#agentes/operacoes", catalogo: "#mais/catalogo", clientes: "#mais/clientes", integracoes: "#mais/integracoes" };
  location.hash = mapa[t] || "#hoje";
}

// ---------------- Roteamento ----------------
async function rotear() {
  const [rota, sub] = (location.hash.slice(1).split("?")[0] || "hoje").split("/");
  document.querySelectorAll("nav.bottom a").forEach((a) => a.classList.toggle("on", a.dataset.t === rota));
  try {
    if (rota === "configurar") return await telaConfigurar();
    if (rota === "pedidos") return await telaPedidos();
    if (rota === "agentes") return await telaAgentes(sub || "visao");
    if (rota === "financeiro") return await telaFinanceiro();
    if (rota === "mais") return await telaMais(sub);
    return await telaHoje();
  } catch (e) {
    if (!/login|Assinatura/.test(e.message)) tela.innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
  }
}
async function iniciar(hash) {
  try { conta = await api("/conta"); } catch { return; }
  $("#nav").classList.remove("hidden"); $("#fab").classList.remove("hidden");
  $("#status-piloto").classList.toggle("hidden", !conta.piloto_automatico);
  if (hash) location.hash = hash;
  const erro = new URLSearchParams(location.hash.split("?")[1] || "").get("erro");
  if (erro) toast(erro);
  rotear();
}
window.addEventListener("hashchange", rotear);
$("#fab").onclick = abrirAssistente;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/app/sw.js").catch(() => {});
iniciar();
setInterval(() => { if (!document.querySelector(".overlay") && (location.hash || "#hoje").startsWith("#hoje")) rotear(); }, 30000);
