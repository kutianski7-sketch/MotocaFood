// Renderiza cenas.html quadro a quadro (30 fps) com Playwright.
// Uso: node render.cjs <pasta_saida> [t1,t2,...]   (lista de tempos = só prévia em PNG)
// SEM_LEGENDA=1 esconde a legenda (usado para o poster).
// DE=<s> ATE=<s> re-renderiza só esse trecho (mantém a numeração dos quadros).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const FPS = 30;
(async () => {
  const out = process.argv[2] || "frames";
  const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;
  fs.mkdirSync(out, { recursive: true });
  const timings = JSON.parse(fs.readFileSync(path.join(__dirname, "timings.json")));
  const amp = JSON.parse(fs.readFileSync(path.join(__dirname, "amp.json")));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", e => console.error("PAGE ERROR:", e.message));
  await page.goto("file://" + path.join(__dirname, "cenas.html"));
  const scenes = await page.evaluate(d => window.init(d), { ...timings, amp });
  if (only) console.log(JSON.stringify(scenes.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)])));
  await page.evaluate(() => document.fonts.ready);
  const total = Math.ceil(timings.duration * FPS);
  const i0 = process.env.DE ? Math.floor(+process.env.DE * FPS) : 0, i1 = process.env.ATE ? Math.min(total, Math.ceil(+process.env.ATE * FPS)) : total;
  const times = only || Array.from({ length: i1 - i0 }, (_, i) => (i0 + i) / FPS);
  for (let i = 0; i < times.length; i++) {
    await page.evaluate(t => window.render(t), times[i]);
    if (process.env.SEM_LEGENDA) await page.evaluate(() => { document.getElementById("legenda").style.opacity = 0; });
    const name = only ? `t_${times[i].toFixed(2)}.png` : `f_${String(i + (only ? 0 : i0)).padStart(5, "0")}.jpg`;
    await page.screenshot({ path: path.join(out, name), type: only ? "png" : "jpeg", quality: only ? undefined : 90 });
    if (!only && i % 300 === 0) console.log(`${i}/${times.length}`);
  }
  await browser.close();
})();
