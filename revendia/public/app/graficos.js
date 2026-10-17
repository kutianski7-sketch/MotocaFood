// Gráficos em SVG puro: barras agrupadas (receita x lucro por mês) e linha (fluxo de caixa projetado).
// Cores das séries vêm dos tokens CSS (--s-receita / --s-lucro), validados para claro e escuro.
(function () {
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const curto = (v) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v));
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const nomeMes = (m) => MESES[Number(m.slice(5, 7)) - 1];
  function teto(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); return Math.ceil(v / p) * p; }

  function tooltip(el) {
    let t = el.querySelector(".tip");
    if (!t) { t = document.createElement("div"); t.className = "tip"; el.appendChild(t); }
    return {
      show(x, y, html) { t.innerHTML = html; t.style.left = x + "px"; t.style.top = y + "px"; t.style.opacity = 1; },
      hide() { t.style.opacity = 0; },
    };
  }

  // series: [{ nome, cor, valores: [..] }], rotulos: [..]
  window.graficoBarras = function (el, rotulos, series) {
    const W = 340, H = 190, m = { t: 14, r: 8, b: 26, l: 46 };
    const max = teto(Math.max(1, ...series.flatMap((s) => s.valores)));
    const iw = W - m.l - m.r, ih = H - m.t - m.b, grupo = iw / rotulos.length, bw = Math.min(16, (grupo - 14) / series.length);
    const y = (v) => m.t + ih - (v / max) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita e lucro por mês">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>` +
        `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${curto(v)}</text>`;
    }
    rotulos.forEach((r, i) => {
      const gx = m.l + grupo * i + (grupo - bw * series.length - 2 * (series.length - 1)) / 2;
      series.forEach((s, k) => {
        const v = Math.max(0, s.valores[i]), x = gx + k * (bw + 2), h = Math.max(0, m.t + ih - y(v)), r = Math.min(4, h / 2, bw / 2);
        // barra com cantos arredondados só no topo, ancorada na base
        svg += `<path d="M${x},${m.t + ih} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${m.t + ih} Z" fill="${s.cor}"/>`;
      });
      svg += `<rect class="hit" data-i="${i}" x="${m.l + grupo * i}" y="${m.t}" width="${grupo}" height="${ih}" fill="transparent"/>`;
      svg += `<text x="${m.l + grupo * i + grupo / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${nomeMes(r)}</text>`;
    });
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--muted)" stroke-width="1"/></svg>`;
    el.innerHTML = `<div class="legend">${series.map((s) => `<span><i style="background:${s.cor}"></i>${s.nome}</span>`).join("")}</div>` + svg;
    const tip = tooltip(el);
    el.querySelectorAll(".hit").forEach((h) => {
      const mostrar = () => {
        const i = Number(h.dataset.i), box = el.querySelector("svg").getBoundingClientRect(), eb = el.getBoundingClientRect();
        const x = (m.l + grupo * i + grupo / 2) / W * box.width + (box.left - eb.left);
        tip.show(x, (m.t + 10) / H * box.height + (box.top - eb.top), `<b>${nomeMes(rotulos[i])}</b><br>${series.map((s) => `${s.nome}: ${brl(s.valores[i])}`).join("<br>")}`);
      };
      h.addEventListener("pointerenter", mostrar); h.addEventListener("pointerdown", mostrar); h.addEventListener("pointerleave", tip.hide);
    });
  };

  // pontos: [{ data: 'AAAA-MM-DD', saldo }]
  window.graficoLinha = function (el, pontos, inicial) {
    const dados = [{ data: "hoje", saldo: inicial }, ...pontos];
    const W = 340, H = 160, m = { t: 14, r: 10, b: 24, l: 50 };
    const vals = dados.map((d) => d.saldo), min = Math.min(0, ...vals), max = teto(Math.max(1, ...vals));
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (dados.length === 1 ? iw / 2 : (i / (dados.length - 1)) * iw);
    const y = (v) => m.t + ih - ((v - min) / (max - min || 1)) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo de caixa projetado">`;
    for (const v of [min, (min + max) / 2, max]) {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${curto(v)}</text>`;
    }
    if (min < 0) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--crit)" stroke-dasharray="4 3"/>`;
    const d = dados.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(" ");
    svg += `<path d="${d}" fill="none" stroke="var(--s-receita)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const ult = dados.length - 1;
    svg += `<circle cx="${x(ult)}" cy="${y(dados[ult].saldo)}" r="4" fill="var(--s-receita)" stroke="var(--surface)" stroke-width="2"/>`;
    svg += `<text x="${m.l}" y="${H - 6}" font-size="11" fill="var(--ink-2)">hoje</text><text x="${W - m.r}" y="${H - 6}" text-anchor="end" font-size="11" fill="var(--ink-2)">${dados[ult].data === "hoje" ? "" : dados[ult].data.slice(8, 10) + "/" + dados[ult].data.slice(5, 7)}</text>`;
    svg += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--muted)" opacity="0"/><rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = svg;
    const tip = tooltip(el), cross = el.querySelector(".cross"), hit = el.querySelector(".hit");
    const mover = (ev) => {
      const box = el.querySelector("svg").getBoundingClientRect(), eb = el.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(ult, Math.round(((px - m.l) / iw) * ult)));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
      const p = dados[i];
      tip.show(x(i) / W * box.width + (box.left - eb.left), y(p.saldo) / H * box.height + (box.top - eb.top),
        `<b>${p.data === "hoje" ? "Hoje" : p.data.slice(8, 10) + "/" + p.data.slice(5, 7)}</b><br>Saldo: ${brl(p.saldo)}`);
    };
    hit.addEventListener("pointermove", mover); hit.addEventListener("pointerdown", mover);
    hit.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("opacity", 0); });
  };
})();
