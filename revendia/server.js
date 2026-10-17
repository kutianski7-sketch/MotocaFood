// RevendIA — servidor web (landing page, app da revendedora, API e webhooks).
import express from "express";
import path from "node:path";
import { config, RAIZ } from "./src/config.js";
import { rotas as auth } from "./src/rotas/auth.js";
import { rotas as api } from "./src/rotas/api.js";
import { rotas as webhooks } from "./src/rotas/webhooks.js";
import { iniciar } from "./src/orquestrador.js";
import { semear } from "./src/seed.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Cookies (parser mínimo)
app.use((req, _res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  next();
});
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" });
  next();
});

app.use("/api/webhooks", webhooks);
app.use("/api", auth);
app.use("/api", api);

const pub = path.join(RAIZ, "public");
app.use(express.static(pub, { extensions: ["html"], maxAge: config.producao ? "1h" : 0 }));
app.get("/app/*", (_req, res) => res.sendFile(path.join(pub, "app", "index.html")));
app.get("/saude", (_req, res) => res.json({ ok: true }));

if (config.demo) semear();
app.listen(config.porta, () => {
  console.log(`RevendIA rodando em ${config.baseUrl} ${config.demo ? "(modo demonstração)" : ""}`);
  iniciar();
});
