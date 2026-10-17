// Agente de marketing: calendário e publicação automática no Instagram, roteiros de Reels, anúncios,
// stories, carrosséis e campanhas/combos para a lista de transmissão do WhatsApp.
import { um, todos, inserir, atualizar, registrarEvento, configDe } from "../db.js";
import * as instagram from "../integracoes/instagram.js";
import { enviarModelo } from "../integracoes/whatsapp.js";
import { temIA, gerarJSON } from "../ai/claude.js";
import { maisVendidos } from "./financeiro.js";
import { listar } from "./catalogo.js";
import { config } from "../config.js";
import { agora, somaDias, reais, decifra, centavos } from "../util.js";

// ---------- Datas comerciais ----------
function nDomingo(ano, mes, n) {
  const d = new Date(ano, mes, 1);
  d.setDate(1 + ((7 - d.getDay()) % 7) + (n - 1) * 7);
  return d;
}
export function proximasDatas(dias = 45) {
  const hoje = new Date(), ano = hoje.getFullYear(), lista = [];
  for (const a of [ano, ano + 1]) {
    const bf = new Date(a, 10, 30); bf.setDate(30 - ((bf.getDay() + 2) % 7)); // última sexta de novembro
    lista.push(
      { nome: "Dia da Mulher", data: new Date(a, 2, 8) }, { nome: "Dia do Consumidor", data: new Date(a, 2, 15) },
      { nome: "Dia das Mães", data: nDomingo(a, 4, 2) }, { nome: "Dia dos Namorados", data: new Date(a, 5, 12) },
      { nome: "Dia dos Pais", data: nDomingo(a, 7, 2) }, { nome: "Dia das Crianças", data: new Date(a, 9, 12) },
      { nome: "Black Friday", data: bf }, { nome: "Natal", data: new Date(a, 11, 25) },
    );
  }
  return lista.filter((d) => d.data >= hoje && d.data <= somaDias(hoje, dias)).sort((x, y) => x.data - y.data);
}

function contexto(rev) {
  const top = maisVendidos(rev.id, 90, 6);
  const produtos = listar(rev.id);
  const destaque = top.length ? top.map((t) => produtos.find((p) => p.id === t.produto_id)).filter(Boolean) : produtos.slice(0, 6);
  return { top, produtos, destaque: destaque.length ? destaque : produtos.slice(0, 6), datas: proximasDatas() };
}

const HORARIOS = [{ dia: 1, h: 12 }, { dia: 3, h: 19 }, { dia: 5, h: 18 }, { dia: 6, h: 10 }, { dia: 0, h: 11 }];
const OBJETIVOS = ["venda direta", "desejo/lifestyle", "prova social", "dica de uso", "oferta relâmpago"];

// ---------- Posts automáticos ----------
export async function gerarCalendario(revendedoraId, quantidade) {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  const cfg = configDe(rev);
  const qtd = quantidade || cfg.postsPorSemana || 4;
  const { destaque, datas } = contexto(rev);
  if (!destaque.length) throw new Error("Conecte uma marca ou cadastre produtos primeiro");

  let ideias = null;
  if (temIA()) {
    try {
      const r = await gerarJSON({
        sistema: `Você é social media de revendedoras de cosméticos no Brasil. Estratégia: alternar venda direta, desejo, prova social e dicas; sempre CTA para chamar no WhatsApp; legendas curtas (até 600 caracteres), emojis com moderação, 5-8 hashtags locais e de nicho. Tom: ${cfg.tom}.`,
        mensagem: `Revendedora: ${rev.nome} (${rev.cidade || "Brasil"}). Crie ${qtd} posts para os próximos 7 dias.\nProdutos em destaque (id | nome | preço):\n${destaque.map((p) => `${p.id} | ${p.nome} | ${reais(p.preco_catalogo)}`).join("\n")}\nDatas comerciais próximas: ${datas.map((d) => d.nome + " " + d.data.toLocaleDateString("pt-BR")).join(", ") || "nenhuma"}`,
        schema: { type: "object", additionalProperties: false, required: ["posts"], properties: { posts: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["produto_id", "objetivo", "legenda"],
          properties: { produto_id: { type: "string" }, objetivo: { type: "string" }, legenda: { type: "string" } } } } } },
      });
      ideias = r.posts;
    } catch (err) { console.warn("[marketing] IA:", err.message); }
  }
  ideias ||= Array.from({ length: qtd }, (_, i) => {
    const p = destaque[i % destaque.length], obj = OBJETIVOS[i % OBJETIVOS.length];
    const data = datas[0] ? ` Perfeito pro ${datas[0].nome}! 🎁` : "";
    const ganchos = {
      "venda direta": `✨ ${p.nome} por ${reais(p.preco_catalogo)}.${data}\nPronta entrega e entrega por motoboy na sua casa 🛵`,
      "desejo/lifestyle": `Aquele cheirinho que fica na memória 💛 ${p.nome}.\nQual momento combina com ele? Me conta!`,
      "prova social": `Minhas clientes não param de pedir ${p.nome} 😍 Já experimentou?`,
      "dica de uso": `Dica de ouro: aplique o ${p.nome} logo após o banho, com a pele ainda úmida, para durar muito mais ✨`,
      "oferta relâmpago": `⚡ Só até domingo: ${p.nome} com brinde surpresa nos pedidos acima de R$ 150!`,
    };
    return { produto_id: p.id, objetivo: obj, legenda: `${ganchos[obj]}\n\n📲 Peça pelo WhatsApp: wa.me/${rev.whatsapp}\n#boticario #natura #revendedora #${(rev.cidade || "brasil").toLowerCase().replace(/\W/g, "")} #perfume #autocuidado` };
  });

  const criados = [];
  const base = new Date();
  ideias.slice(0, qtd).forEach((ideia, i) => {
    const hr = HORARIOS[i % HORARIOS.length];
    const d = somaDias(base, ((hr.dia - base.getDay() + 7) % 7) || 7);
    d.setHours(hr.h, 0, 0, 0);
    const prod = um("SELECT * FROM produtos WHERE id = ?", ideia.produto_id) || destaque[0];
    criados.push(inserir("posts", { revendedora_id: revendedoraId, produto_id: prod.id, legenda: ideia.legenda, imagem: prod.imagem, formato: "feed",
      objetivo: ideia.objetivo, agendado_para: d.toISOString(), status: "agendado", criado_em: agora() }));
  });
  registrarEvento(revendedoraId, "marketing", `${criados.length} posts criados e agendados no Instagram`);
  return criados;
}

export async function publicarPendentes(revendedoraId) {
  const integ = um("SELECT * FROM integracoes WHERE revendedora_id = ? AND tipo = 'instagram' AND status = 'conectado'", revendedoraId);
  if (!integ) return 0;
  const cred = decifra(integ.credenciais);
  let n = 0;
  for (const post of todos("SELECT * FROM posts WHERE revendedora_id = ? AND status = 'agendado' AND agendado_para <= ?", revendedoraId, agora())) {
    try {
      const imagemUrl = /^https?:/.test(post.imagem) ? post.imagem : `${config.baseUrl}${post.imagem}`;
      const r = await instagram.publicar(cred, { imagemUrl, legenda: post.legenda });
      atualizar("posts", post.id, { status: "publicado", ig_media_id: r.id });
      n++;
    } catch (err) {
      atualizar("posts", post.id, { status: "erro", metricas_json: JSON.stringify({ erro: err.message }) });
    }
  }
  if (n) registrarEvento(revendedoraId, "marketing", `${n} post(s) publicados no Instagram`);
  return n;
}

// ---------- Conteúdos: roteiros de Reels, anúncios, stories, carrossel ----------
const TIPOS = {
  roteiro_reels: "roteiro de Reels/TikTok de 20-30s: gancho nos 3 primeiros segundos, cenas numeradas com o que filmar e o que falar, texto na tela, áudio sugerido e CTA",
  anuncio: "anúncio para Meta Ads (Instagram/Facebook) com objetivo de mensagens no WhatsApp: 3 variações de texto principal, 3 títulos, público sugerido (idade, interesses, raio em km da cidade), orçamento diário sugerido em reais e duração",
  stories: "sequência de 5 stories com enquete/caixa de perguntas, contagem regressiva e link para WhatsApp",
  carrossel: "carrossel de 6 slides (título de cada slide + texto curto) educativo que termina em oferta",
};
export async function gerarConteudo(revendedoraId, tipo, { produtoId, tema } = {}) {
  if (!TIPOS[tipo]) throw new Error("Tipo de conteúdo inválido");
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  const { destaque, datas } = contexto(rev);
  const produto = (produtoId && um("SELECT * FROM produtos WHERE id = ?", produtoId)) || destaque[0];
  const assunto = tema || (datas[0] ? `${datas[0].nome}` : "campeões de venda do ciclo");
  let corpo = null;
  if (temIA()) {
    try {
      corpo = await gerarJSON({
        sistema: `Você é estrategista de marketing para revendedoras de cosméticos no Brasil. Gere conteúdo pronto para usar, em português, sem prometer resultados irreais e sem usar logotipos/marcas de forma enganosa (ela é revendedora autorizada). Tom: ${configDe(rev).tom}.`,
        mensagem: `Crie um ${TIPOS[tipo]}.\nRevendedora: ${rev.nome}, cidade ${rev.cidade || "-"}, WhatsApp wa.me/${rev.whatsapp}.\nProduto foco: ${produto?.nome} (${reais(produto?.preco_catalogo)}).\nTema: ${assunto}.`,
        schema: { type: "object", additionalProperties: false, required: ["titulo", "secoes"], properties: {
          titulo: { type: "string" },
          secoes: { type: "array", items: { type: "object", additionalProperties: false, required: ["titulo", "texto"], properties: { titulo: { type: "string" }, texto: { type: "string" } } } } } },
      });
    } catch (err) { console.warn("[conteudo] IA:", err.message); }
  }
  corpo ||= modeloConteudo(tipo, rev, produto, assunto);
  return inserir("conteudos", { revendedora_id: revendedoraId, tipo, titulo: corpo.titulo, corpo_json: JSON.stringify(corpo.secoes), status: "pronto", criado_em: agora() });
}

function modeloConteudo(tipo, rev, p, assunto) {
  const nome = p?.nome || "seu produto favorito", preco = reais(p?.preco_catalogo);
  const S = (titulo, texto) => ({ titulo, texto });
  const m = {
    roteiro_reels: { titulo: `Reels: ${nome} — ${assunto}`, secoes: [
      S("Gancho (0-3s)", `Close no frasco + texto na tela: "O perfume que mais me pedem esse mês 👀"`),
      S("Cena 2 (3-10s)", `Borrife no pulso e fale: "Ele é ${p?.categoria?.toLowerCase() || "incrível"}, fixa o dia todo e custa ${preco}."`),
      S("Cena 3 (10-20s)", `Mostre a sacolinha sendo montada e o motoboy chegando: "Você pede no WhatsApp e recebe em casa."`),
      S("CTA (20-25s)", `"Comenta EU QUERO que eu te mando no direct" + texto: wa.me/${rev.whatsapp}`),
      S("Áudio", "Áudio em alta na aba Reels com batida leve; legenda curta com 5 hashtags.") ] },
    anuncio: { titulo: `Anúncio: ${nome}`, secoes: [
      S("Texto principal 1", `✨ ${nome} por ${preco} com entrega rápida por motoboy. Chama no WhatsApp e garanta o seu!`),
      S("Texto principal 2", `Presente certo para ${assunto}: ${nome}. Embalo pra presente sem custo 🎁`),
      S("Texto principal 3", `Revendedora autorizada em ${rev.cidade || "sua cidade"} — parcelo e entrego na sua casa.`),
      S("Títulos", `"${nome} pronta entrega" • "Presente perfeito ${assunto}" • "Entrega hoje na sua casa"`),
      S("Público", `Mulheres e homens 22-55 anos, raio de 8 km de ${rev.cidade || "sua cidade"}, interesses: perfumaria, beleza, presentes.`),
      S("Orçamento", "R$ 10/dia por 7 dias, objetivo: mensagens no WhatsApp. Pausar se o custo por conversa passar de R$ 4.") ] },
    stories: { titulo: `Stories: ${assunto}`, secoes: [
      S("Story 1", "Enquete: 'Perfume doce ou amadeirado?'"), S("Story 2", `Foto do ${nome} com preço ${preco}`),
      S("Story 3", "Caixa de perguntas: 'Qual presente você está procurando?'"), S("Story 4", "Contagem regressiva da promoção do ciclo"),
      S("Story 5", `Link para WhatsApp: wa.me/${rev.whatsapp} — 'Toca aqui e garante o seu'`) ] },
    carrossel: { titulo: `Carrossel: como escolher o perfume ideal`, secoes: [
      S("Slide 1", "Como escolher o perfume certo (sem errar no presente) 👇"), S("Slide 2", "Floral: delicado, para o dia a dia"),
      S("Slide 3", "Amadeirado: marcante, para a noite"), S("Slide 4", "Doce/gourmand: aconchegante e envolvente"),
      S("Slide 5", "Dica: teste na pele e espere 15 minutos"), S("Slide 6", `Oferta: ${nome} por ${preco} — chama no WhatsApp!`) ] },
  };
  return m[tipo];
}

// ---------- Campanhas e combos ----------
export async function sugerirCampanhas(revendedoraId) {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  const margem = configDe(rev).margemPadrao;
  const { destaque, datas } = contexto(rev);
  const sugestoes = [];
  if (destaque.length >= 2) {
    const [a, b] = destaque;
    const desconto = Math.min(15, Math.floor(margem * 100 / 3)); // preserva pelo menos 2/3 da margem
    const total = centavos((a.preco_catalogo + b.preco_catalogo) * (1 - desconto / 100));
    sugestoes.push({ nome: `Combo ${a.nome.split(" ")[0]} + ${b.nome.split(" ")[0]}`, tipo: "combo", desconto_pct: desconto, publico: "todos",
      produtos: [a.id, b.id], descricao: "Combina os dois mais vendidos para aumentar o ticket médio.",
      mensagem: `💛 Combo especial do ciclo: ${a.nome} + ${b.nome} de ${reais(a.preco_catalogo + b.preco_catalogo)} por ${reais(total)}! Responda QUERO que eu separo o seu.` });
  }
  if (datas[0] && destaque[0]) {
    sugestoes.push({ nome: `${datas[0].nome}: presente garantido`, tipo: "sazonal", desconto_pct: 0, publico: "todos", produtos: destaque.slice(0, 3).map((p) => p.id),
      descricao: `Campanha para ${datas[0].nome} (${datas[0].data.toLocaleDateString("pt-BR")}).`,
      mensagem: `🎁 ${datas[0].nome} chegando! Separei presentes lindos: ${destaque.slice(0, 3).map((p) => p.nome).join(", ")}. Embalo pra presente e entrego por motoboy. Quer ver as opções?` });
  }
  const inativos = todos(`SELECT c.id FROM clientes c WHERE c.revendedora_id = ? AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id AND p.criado_em >= ?)
    AND EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id)`, revendedoraId, somaDias(new Date(), -45).toISOString());
  if (inativos.length) {
    sugestoes.push({ nome: "Reativação de clientes", tipo: "reativacao", desconto_pct: 10, publico: "inativos_45d", produtos: destaque.slice(0, 2).map((p) => p.id),
      descricao: `${inativos.length} clientes não compram há mais de 45 dias.`,
      mensagem: "Oi, sumida! 💛 Senti sua falta por aqui. Separei 10% OFF só pra você nesse ciclo. Quer que eu te mande as novidades?" });
  }
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, "0");
  const aniv = todos("SELECT id FROM clientes WHERE revendedora_id = ? AND substr(aniversario,6,2) = ?", revendedoraId, mesAtual);
  if (aniv.length) {
    sugestoes.push({ nome: "Aniversariantes do mês", tipo: "aniversario", desconto_pct: 10, publico: "aniversariantes", produtos: [],
      descricao: `${aniv.length} clientes fazem aniversário este mês.`, mensagem: "Parabéns! 🎂 Você ganhou 10% OFF em qualquer produto este mês. É só me chamar!" });
  }
  return sugestoes.map((s) => inserir("campanhas", { revendedora_id: revendedoraId, nome: s.nome, tipo: s.tipo, descricao: s.descricao, mensagem: s.mensagem,
    produtos_json: JSON.stringify(s.produtos), desconto_pct: s.desconto_pct, publico: s.publico, status: "sugerida", criado_em: agora() }));
}

function publicoDaCampanha(c) {
  const base = "SELECT * FROM clientes WHERE revendedora_id = ? AND na_lista_transmissao = 1 AND whatsapp IS NOT NULL";
  if (c.publico === "inativos_45d") {
    return todos(`${base} AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.cliente_id = clientes.id AND p.criado_em >= ?)`, c.revendedora_id, somaDias(new Date(), -45).toISOString());
  }
  if (c.publico === "aniversariantes") return todos(`${base} AND substr(aniversario,6,2) = ?`, c.revendedora_id, String(new Date().getMonth() + 1).padStart(2, "0"));
  return todos(base, c.revendedora_id);
}

// Envia para a lista de transmissão (modelo de marketing aprovado na Meta: {{1}} = nome, {{2}} = mensagem)
export async function enviarCampanha(revendedoraId, campanhaId) {
  const c = um("SELECT * FROM campanhas WHERE id = ? AND revendedora_id = ?", campanhaId, revendedoraId);
  if (!c) throw new Error("Campanha não encontrada");
  const publico = publicoDaCampanha(c);
  for (const cli of publico) {
    await enviarModelo(cli.whatsapp, "campanha_revendedora", [cli.nome.split(" ")[0], c.mensagem], { revendedoraId, emNomeDaRevendedora: true, textoLog: c.mensagem });
  }
  atualizar("campanhas", c.id, { status: "enviada", enviada_em: agora(), resultado_json: JSON.stringify({ enviados: publico.length }) });
  registrarEvento(revendedoraId, "campanha", `Campanha "${c.nome}" enviada para ${publico.length} clientes`);
  return publico.length;
}

// Resultado: pedidos feitos pelo público até 7 dias após o envio
export function medirCampanhas(revendedoraId) {
  for (const c of todos("SELECT * FROM campanhas WHERE revendedora_id = ? AND status = 'enviada'", revendedoraId)) {
    const fim = somaDias(c.enviada_em, 7).toISOString();
    const r = um(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS receita FROM pedidos WHERE revendedora_id = ? AND criado_em BETWEEN ? AND ?`, revendedoraId, c.enviada_em, fim);
    const res = { ...JSON.parse(c.resultado_json || "{}"), pedidos: r.pedidos, receita: centavos(r.receita) };
    atualizar("campanhas", c.id, { resultado_json: JSON.stringify(res), status: new Date() > new Date(fim) ? "concluida" : "enviada" });
  }
}
