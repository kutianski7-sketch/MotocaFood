// Renderiza cada <section class="peca"> de artes.html num PNG.
// Uso: NODE_PATH=$(npm root -g) node render.js <pasta_saida> [filtro]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const out = process.argv[2] || "out";
  const filtro = process.argv[3] || "";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 2100 } });
  await page.goto("file://" + path.join(__dirname, "artes.html"));
  await page.evaluate(() => document.fonts.ready);
  const pecas = await page.$$("section.peca");
  for (const p of pecas) {
    const nome = await p.getAttribute("data-nome");
    if (filtro && !nome.includes(filtro)) continue;
    const arq = path.join(out, nome + ".png");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    await p.screenshot({ path: arq });
    console.log(arq);
  }
  await browser.close();
})();
