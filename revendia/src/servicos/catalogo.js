// Catálogo: sincroniza com a conta da revendedora na marca ou recebe produtos manuais/CSV.
import { db, um, todos, inserir, atualizar, registrarEvento } from "../db.js";
import { conector, infoMarca } from "../integracoes/fornecedores/index.js";
import { agora, decifra, centavos } from "../util.js";

export async function sincronizar(revendedoraId, marca) {
  const integ = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'fornecedor' AND provedor = ?", revendedoraId, marca);
  if (!integ) throw new Error("Marca não conectada");
  const produtos = await conector(marca).sincronizarCatalogo(decifra(integ.credenciais));
  const up = db.prepare(`INSERT INTO produtos (id, revendedora_id, fornecedor, sku, nome, categoria, preco_catalogo, preco_custo, imagem, origem, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sync', ?)
    ON CONFLICT(revendedora_id, fornecedor, sku) DO UPDATE SET nome=excluded.nome, categoria=excluded.categoria,
      preco_catalogo=excluded.preco_catalogo, preco_custo=excluded.preco_custo, imagem=excluded.imagem, atualizado_em=excluded.atualizado_em`);
  for (const p of produtos) {
    up.run(`p_${revendedoraId.slice(-6)}_${marca}_${p.sku}`, revendedoraId, marca, p.sku, p.nome, p.categoria, p.preco_catalogo, p.preco_custo, p.imagem || null, agora());
  }
  atualizar("integracoes", integ.id, { atualizado_em: agora() });
  registrarEvento(revendedoraId, "catalogo", `Catálogo ${infoMarca(marca).nome} sincronizado: ${produtos.length} produtos`);
  return produtos.length;
}

export function adicionarManual(revendedoraId, p) {
  if (!p.nome || !(Number(p.preco_catalogo) > 0)) throw new Error("Informe nome e preço");
  const margem = Number(p.margem ?? 0.3);
  return inserir("produtos", {
    revendedora_id: revendedoraId,
    fornecedor: p.fornecedor || "outra",
    sku: p.sku || `MAN-${Date.now().toString(36)}`,
    nome: p.nome,
    categoria: p.categoria || "Outros",
    preco_catalogo: centavos(p.preco_catalogo),
    preco_custo: centavos(p.preco_custo || p.preco_catalogo * (1 - margem)),
    estoque: Number(p.estoque || 0),
    imagem: p.imagem || "/assets/produtos/creme.svg",
    origem: "manual",
    atualizado_em: agora(),
  });
}

// CSV simples: nome;preco;custo;categoria;estoque;marca (vírgula ou ponto e vírgula)
export function importarCSV(revendedoraId, texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const linha of linhas) {
    const c = linha.split(/;|\t/).length > 1 ? linha.split(/;|\t/) : linha.split(",");
    const preco = Number(String(c[1] || "").replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    if (!c[0] || !(preco > 0)) continue; // ignora cabeçalho/linhas inválidas
    const custo = Number(String(c[2] || "").replace(/\./g, "").replace(",", ".")) || undefined;
    adicionarManual(revendedoraId, { nome: c[0].trim(), preco_catalogo: preco, preco_custo: custo, categoria: c[3]?.trim(), estoque: c[4], fornecedor: c[5]?.trim().toLowerCase() });
    n++;
  }
  return n;
}

export const listar = (revendedoraId) =>
  todos("SELECT * FROM produtos WHERE revendedora_id = ? AND ativo = 1 ORDER BY fornecedor, categoria, nome", revendedoraId);

// Busca aproximada por nome (usada quando a IA está offline)
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function buscarAproximado(revendedoraId, termo) {
  const palavras = norm(termo).split(/\W+/).filter((w) => w.length > 2);
  let melhor = null, nota = 0;
  for (const p of listar(revendedoraId)) {
    const nome = norm(p.nome);
    const n = palavras.filter((w) => nome.includes(w)).length;
    if (n > nota) { melhor = p; nota = n; }
  }
  return nota ? melhor : null;
}
