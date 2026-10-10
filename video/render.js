// Renderiza cenas.html quadro a quadro (30 fps) com Playwright.
// Uso: node render.js <pasta_saida> [t1,t2,...]   (lista de tempos = só prévia)
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
  await page.goto("file://" + path.join(__dirname, "cenas.html"));
  await page.evaluate(d => window.init(d), { ...timings, amp });
  await page.evaluate(() => document.fonts.ready);
  const times = only || Array.from({ length: Math.ceil(timings.duration * FPS) }, (_, i) => i / FPS);
  for (let i = 0; i < times.length; i++) {
    await page.evaluate(t => window.render(t), times[i]);
    const name = only ? `t_${times[i].toFixed(2)}.png` : `f_${String(i).padStart(5, "0")}.jpg`;
    await page.screenshot({ path: path.join(out, name), type: only ? "png" : "jpeg", quality: only ? undefined : 92 });
    if (!only && i % 150 === 0) console.log(`${i}/${times.length}`);
  }
  await browser.close();
})();
