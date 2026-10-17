// Banco de dados (SQLite embutido do Node 22 — sem dependências nativas).
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { id, agora } from "./util.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS revendedoras (
  id TEXT PRIMARY KEY, nome TEXT, whatsapp TEXT UNIQUE NOT NULL, cidade TEXT, endereco_coleta TEXT,
  chave_pix TEXT, plano TEXT, assinatura_status TEXT DEFAULT 'pendente', assinatura_ate TEXT,
  piloto_automatico INTEGER DEFAULT 1, config_json TEXT DEFAULT '{}', criado_em TEXT
);
CREATE TABLE IF NOT EXISTS otps (
  whatsapp TEXT PRIMARY KEY, codigo_hash TEXT, finalidade TEXT, expira_em TEXT, tentativas INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, revendedora_id TEXT, criado_em TEXT, confirmado_em TEXT);
CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY, revendedora_id TEXT, whatsapp TEXT, nome TEXT, plano TEXT, metodo TEXT, valor REAL,
  status TEXT, provedor_id TEXT, pix_copia_cola TEXT, pix_qr_base64 TEXT, link_cartao TEXT, criado_em TEXT, pago_em TEXT
);
CREATE TABLE IF NOT EXISTS integracoes (
  id TEXT PRIMARY KEY, revendedora_id TEXT, tipo TEXT, provedor TEXT, status TEXT, credenciais TEXT,
  meta_json TEXT DEFAULT '{}', atualizado_em TEXT, UNIQUE(revendedora_id, tipo, provedor)
);
CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, fornecedor TEXT, sku TEXT, nome TEXT, categoria TEXT,
  preco_catalogo REAL, preco_custo REAL, estoque INTEGER DEFAULT 0, imagem TEXT, ativo INTEGER DEFAULT 1,
  origem TEXT, atualizado_em TEXT, UNIQUE(revendedora_id, fornecedor, sku)
);
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, revendedora_id TEXT, nome TEXT, whatsapp TEXT, endereco TEXT, aniversario TEXT,
  tags TEXT DEFAULT '', na_lista_transmissao INTEGER DEFAULT 1, preferencias TEXT, nps INTEGER,
  onboarding_status TEXT DEFAULT 'pendente', criado_em TEXT, UNIQUE(revendedora_id, whatsapp)
);
CREATE TABLE IF NOT EXISTS lotes (
  id TEXT PRIMARY KEY, revendedora_id TEXT, fornecedor TEXT, status TEXT, total_custo REAL DEFAULT 0,
  pedido_fornecedor_id TEXT, previsao_chegada TEXT, criado_em TEXT, enviado_em TEXT, atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, cliente_id TEXT, status TEXT, origem TEXT,
  mensagem_original TEXT, total REAL DEFAULT 0, custo REAL DEFAULT 0, pago_pelo_cliente INTEGER DEFAULT 0,
  previsao_chegada TEXT, previsao_entrega TEXT, observacao TEXT, criado_em TEXT, atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS itens_pedido (
  id TEXT PRIMARY KEY, pedido_id TEXT, produto_id TEXT, fornecedor TEXT, sku TEXT, nome TEXT, qtd INTEGER, preco_unit REAL,
  custo_unit REAL, de_estoque INTEGER DEFAULT 0, lote_id TEXT
);
CREATE TABLE IF NOT EXISTS boletos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, lote_id TEXT, fornecedor TEXT, valor REAL, vencimento TEXT,
  linha_digitavel TEXT, pix_copia_cola TEXT, status TEXT DEFAULT 'aberto', pago_em TEXT, forma_identificacao TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS entregas (
  id TEXT PRIMARY KEY, revendedora_id TEXT, pedido_id TEXT, provedor TEXT, provedor_id TEXT, status TEXT,
  valor_frete REAL, motoboy_nome TEXT, link_rastreio TEXT, agendada_para TEXT, criado_em TEXT, atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, revendedora_id TEXT, produto_id TEXT, legenda TEXT, imagem TEXT, formato TEXT,
  objetivo TEXT, agendado_para TEXT, status TEXT, ig_media_id TEXT, metricas_json TEXT DEFAULT '{}', criado_em TEXT
);
CREATE TABLE IF NOT EXISTS campanhas (
  id TEXT PRIMARY KEY, revendedora_id TEXT, nome TEXT, tipo TEXT, descricao TEXT, mensagem TEXT,
  produtos_json TEXT DEFAULT '[]', desconto_pct REAL DEFAULT 0, publico TEXT, status TEXT,
  agendada_para TEXT, enviada_em TEXT, resultado_json TEXT DEFAULT '{}', criado_em TEXT
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, tipo TEXT, categoria TEXT, descricao TEXT, valor REAL,
  data TEXT, pedido_id TEXT, boleto_id TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS relatorios (
  id TEXT PRIMARY KEY, revendedora_id TEXT, mes TEXT, dados_json TEXT, analise TEXT, criado_em TEXT,
  UNIQUE(revendedora_id, mes)
);
CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY, revendedora_id TEXT, direcao TEXT, contato TEXT, texto TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS eventos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, tipo TEXT, mensagem TEXT, criado_em TEXT
);
-- Comercial
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, revendedora_id TEXT, nome TEXT, whatsapp TEXT, origem TEXT, interesse TEXT,
  score INTEGER DEFAULT 0, temperatura TEXT, estagio TEXT DEFAULT 'novo', cadencia TEXT, passo_cadencia INTEGER DEFAULT 0,
  proxima_acao_em TEXT, ultima_interacao_em TEXT, notas TEXT, cliente_id TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS propostas (
  id TEXT PRIMARY KEY, revendedora_id TEXT, lead_id TEXT, cliente_id TEXT, titulo TEXT, itens_json TEXT,
  subtotal REAL, desconto_pct REAL DEFAULT 0, total REAL, validade TEXT, texto TEXT, status TEXT, criado_em TEXT
);
CREATE TABLE IF NOT EXISTS analises_conversa (
  id TEXT PRIMARY KEY, revendedora_id TEXT, contato TEXT, canal TEXT, transcricao TEXT, analise_json TEXT, criado_em TEXT
);
-- Marketing (roteiros de vídeo, anúncios, stories, carrosséis)
CREATE TABLE IF NOT EXISTS conteudos (
  id TEXT PRIMARY KEY, revendedora_id TEXT, tipo TEXT, titulo TEXT, corpo_json TEXT, status TEXT, criado_em TEXT
);
-- Operações / CS / suporte
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY, revendedora_id TEXT, cliente_id TEXT, pedido_id TEXT, origem TEXT, categoria TEXT, assunto TEXT,
  descricao TEXT, criticidade TEXT, status TEXT DEFAULT 'aberto', resposta TEXT, sla_ate TEXT, criado_em TEXT, resolvido_em TEXT
);
-- Financeiro
CREATE TABLE IF NOT EXISTS extrato (
  id TEXT PRIMARY KEY, revendedora_id TEXT, data TEXT, descricao TEXT, valor REAL, documento TEXT,
  status TEXT DEFAULT 'pendente', conciliado_tipo TEXT, conciliado_id TEXT, criado_em TEXT,
  UNIQUE(revendedora_id, data, descricao, valor, documento)
);
CREATE TABLE IF NOT EXISTS cobrancas (
  id TEXT PRIMARY KEY, revendedora_id TEXT, cliente_id TEXT, pedido_id TEXT, valor REAL, vencimento TEXT,
  status TEXT DEFAULT 'aberta', lembretes INTEGER DEFAULT 0, ultimo_lembrete_em TEXT, pix_copia_cola TEXT, pago_em TEXT, criado_em TEXT
);
CREATE INDEX IF NOT EXISTS ix_pedidos_rev ON pedidos(revendedora_id, status);
CREATE INDEX IF NOT EXISTS ix_lanc_rev ON lancamentos(revendedora_id, data);
CREATE INDEX IF NOT EXISTS ix_posts_rev ON posts(revendedora_id, status, agendado_para);
`);

// Helpers curtos
export const um = (sql, ...p) => db.prepare(sql).get(...p);
export const todos = (sql, ...p) => db.prepare(sql).all(...p);
export const exec = (sql, ...p) => db.prepare(sql).run(...p);

const SEM_ID = new Set(["sessoes", "otps"]);
export function inserir(tabela, obj) {
  const dados = SEM_ID.has(tabela) ? { ...obj } : { id: obj.id || id(), ...obj };
  const cols = Object.keys(dados);
  db.prepare(`INSERT INTO ${tabela} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
    ...cols.map((c) => dados[c] ?? null),
  );
  return dados;
}

export function atualizar(tabela, idRegistro, campos) {
  const cols = Object.keys(campos);
  if (!cols.length) return;
  db.prepare(`UPDATE ${tabela} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...cols.map((c) => campos[c] ?? null),
    idRegistro,
  );
}

export function transacao(fn) {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function registrarEvento(revendedoraId, tipo, mensagem) {
  inserir("eventos", { revendedora_id: revendedoraId, tipo, mensagem, criado_em: agora() });
}

export const configDe = (rev) => {
  try {
    return { margemPadrao: 0.3, autoMotoboy: true, autoInstagram: true, autoCampanhas: true, horaLista: 8, postsPorSemana: 4, tom: "carinhoso e próximo", ...JSON.parse(rev.config_json || "{}") };
  } catch {
    return {};
  }
};
