// Teste grátis de 7 dias: cadastro sem cartão, ativação ao confirmar o WhatsApp e bloqueio ao expirar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "revendia-teste-"));
process.env.DB_PATH = path.join(dir, "t.db");
process.env.DEMO = "0";
process.env.PORT = "0";

const express = (await import("express")).default;
const { rotas: auth } = await import("../src/rotas/auth.js");
const { rotas: api } = await import("../src/rotas/api.js");
const { um, exec } = await import("../src/db.js");

const app = express();
app.use(express.json());
app.use((req, _r, next) => { req.cookies = Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter(([k]) => k)); next(); });
app.use("/api", auth); app.use("/api", api);
const srv = app.listen(0);
const base = `http://127.0.0.1:${srv.address().port}/api`;
const post = (u, b, cookie) => fetch(base + u, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });

test("teste grátis libera 7 dias sem pagamento e bloqueia ao expirar", async () => {
  const r1 = await post("/teste", { nome: "Bia Teste", whatsapp: "(21) 98888-7777" });
  const d1 = await r1.json();
  assert.equal(r1.status, 200);
  assert.match(d1.codigoDev, /^\d{6}$/);
  assert.equal(um("SELECT assinatura_status FROM revendedoras WHERE whatsapp = '5521988887777'").assinatura_status, "pendente_teste");

  const r2 = await post("/auth/verificar", { whatsapp: "21988887777", codigo: d1.codigoDev });
  assert.equal(r2.status, 200);
  const cookie = r2.headers.get("set-cookie").split(";")[0];
  const rev = um("SELECT * FROM revendedoras WHERE whatsapp = '5521988887777'");
  assert.equal(rev.assinatura_status, "teste");
  const dias = (new Date(rev.assinatura_ate) - Date.now()) / 86400000;
  assert.ok(dias > 6.9 && dias <= 7.01);

  assert.equal((await fetch(base + "/conta", { headers: { cookie } })).status, 200);
  assert.equal((await post("/teste", { nome: "De novo", whatsapp: "21988887777" })).status, 409, "um teste por número");

  exec("UPDATE revendedoras SET assinatura_ate = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), rev.id);
  assert.equal((await fetch(base + "/conta", { headers: { cookie } })).status, 402, "teste expirado pede assinatura");
});

test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
