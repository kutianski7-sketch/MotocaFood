// Dados de demonstração: a revendedora "Juliana" com 6 meses de histórico.
import { db, um, inserir, exec } from "./db.js";
import { CATALOGOS } from "./integracoes/fornecedores/catalogo-base.js";
import { cifra, centavos, somaDias, pixCopiaECola } from "./util.js";

export function semear() {
  if (um("SELECT id FROM revendedoras WHERE id = 'rev_demo'")) return;
  let s = 42;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const R = "rev_demo";
  const hoje = new Date();

  db.exec("BEGIN");
  try {
    inserir("revendedoras", { id: R, nome: "Juliana Souza", whatsapp: "5511999990000", cidade: "São Paulo", endereco_coleta: "Rua das Acácias, 120 — Vila Mariana, São Paulo/SP",
      chave_pix: "juliana.souza@email.com", plano: "mensal", assinatura_status: "teste", assinatura_ate: somaDias(hoje, 3650).toISOString(), criado_em: somaDias(hoje, -180).toISOString(),
      config_json: JSON.stringify({ tom: "carinhoso e próximo" }) });
    for (const marca of ["boticario", "natura"]) {
      inserir("integracoes", { revendedora_id: R, tipo: "fornecedor", provedor: marca, status: "conectado", credenciais: cifra({ codigo: marca === "boticario" ? "BT-482913" : "NT-77120" }),
        meta_json: JSON.stringify({ conta: "demo", nome: `${CATALOGOS[marca].nome} • demo` }), atualizado_em: hoje.toISOString() });
      for (const p of CATALOGOS[marca].produtos) {
        const tipo = p.categoria.toLowerCase().includes("perfum") ? "perfume" : p.categoria.toLowerCase().includes("maqui") ? "make" : "creme";
        inserir("produtos", { id: `p_demo_${marca}_${p.sku}`, revendedora_id: R, fornecedor: marca, sku: p.sku, nome: p.nome, categoria: p.categoria, preco_catalogo: p.preco_catalogo,
          preco_custo: centavos(p.preco_catalogo * 0.7), estoque: rnd() < 0.3 ? 2 : 0, imagem: `/assets/produtos/${tipo}.svg`, origem: "sync", atualizado_em: hoje.toISOString() });
      }
    }
    inserir("integracoes", { revendedora_id: R, tipo: "whatsapp", provedor: "meta", status: "conectado", credenciais: cifra({ simulado: true }), meta_json: JSON.stringify({ phoneNumberId: "demo_rev_demo", numero: "5511999990000" }), atualizado_em: hoje.toISOString() });
    inserir("integracoes", { revendedora_id: R, tipo: "instagram", provedor: "instagram", status: "conectado", credenciais: cifra({ simulado: true }), meta_json: JSON.stringify({ usuario: "ju.cosmeticos" }), atualizado_em: hoje.toISOString() });
    inserir("integracoes", { revendedora_id: R, tipo: "motoboy", provedor: "simulado", status: "conectado", credenciais: cifra({}), meta_json: "{}", atualizado_em: hoje.toISOString() });

    const nomes = ["Ana Paula", "Carla Mendes", "Júlia Ramos", "Fernanda Lima", "Patrícia Alves", "Renata Costa", "Beatriz Nunes", "Camila Rocha", "Daniela Freitas", "Elaine Martins",
      "Gabriela Dias", "Larissa Moura", "Mariana Teixeira", "Priscila Gomes", "Sandra Ribeiro", "Tatiane Lopes", "Vanessa Pinto", "Aline Barbosa", "Bruna Cardoso", "Cristina Melo",
      "Roberto Silva", "Marcos Oliveira", "Lucas Pereira", "Débora Santos", "Kátia Araújo"];
    const ruas = ["Rua Domingos de Morais", "Av. Jabaquara", "Rua Vergueiro", "Rua Loefgren", "Av. Lins de Vasconcelos", "Rua Santa Cruz"];
    const clientes = nomes.map((nome, i) => inserir("clientes", { id: `cli_demo_${i}`, revendedora_id: R, nome, whatsapp: `55119${String(81000000 + i * 7311).slice(0, 8)}`,
      endereco: `${pick(ruas)}, ${100 + Math.floor(rnd() * 1800)} — São Paulo/SP`, aniversario: `1990-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i * 7) % 28).padStart(2, "0")}`,
      nps: rnd() < 0.5 ? pick([10, 10, 9, 9, 8, 7, 6]) : null, onboarding_status: "concluido", criado_em: somaDias(hoje, -170 + i).toISOString() }));
    const produtos = db.prepare("SELECT * FROM produtos WHERE revendedora_id = ?").all(R);
    const populares = produtos.filter((p) => /Malbec|Lily|Nativa SPA Hidratante|Essencial|Kaiak|Floratta|Ekos/.test(p.nome));

    // Histórico: vendas crescendo mês a mês
    for (let m = 5; m >= 0; m--) {
      const qtdPedidos = Math.round(14 + (5 - m) * 4.5 + rnd() * 4);
      for (let k = 0; k < qtdPedidos; k++) {
        const ini = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
        const diasNoMes = m === 0 ? Math.max(1, hoje.getDate() - 3) : 28;
        const data = somaDias(ini, Math.floor(rnd() * diasNoMes));
        data.setHours(9 + Math.floor(rnd() * 11), Math.floor(rnd() * 59));
        const cli = pick(clientes);
        const itens = Array.from({ length: 1 + Math.floor(rnd() * 2.4) }, () => (rnd() < 0.7 ? pick(populares) : pick(produtos)));
        const pid = `ped_demo_${m}_${k}`;
        let total = 0, custo = 0;
        for (const p of itens) {
          inserir("itens_pedido", { pedido_id: pid, produto_id: p.id, fornecedor: p.fornecedor, sku: p.sku, nome: p.nome, qtd: 1, preco_unit: p.preco_catalogo, custo_unit: p.preco_custo, de_estoque: 0 });
          total += p.preco_catalogo; custo += p.preco_custo;
        }
        const ts = data.toISOString();
        inserir("pedidos", { id: pid, revendedora_id: R, cliente_id: cli.id, status: "entregue", origem: pick(["whatsapp", "whatsapp", "instagram", "manual"]), total: centavos(total), custo: centavos(custo),
          pago_pelo_cliente: 1, previsao_entrega: somaDias(data, 6).toISOString(), criado_em: ts, atualizado_em: somaDias(data, 6).toISOString() });
        inserir("lancamentos", { revendedora_id: R, tipo: "receita", categoria: "Vendas", descricao: `Venda para ${cli.nome}`, valor: centavos(total), data: ts.slice(0, 10), pedido_id: pid, status: "realizado" });
        inserir("lancamentos", { revendedora_id: R, tipo: "custo", categoria: "Compra de mercadoria", descricao: "Pedido na marca", valor: centavos(custo), data: ts.slice(0, 10), status: "realizado" });
        if (rnd() < 0.6) inserir("lancamentos", { revendedora_id: R, tipo: "despesa", categoria: "Frete/motoboy", descricao: `Entrega ${cli.nome}`, valor: 12.9, data: somaDias(data, 6).toISOString().slice(0, 10), pedido_id: pid, status: "realizado" });
      }
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - m, 5).toISOString().slice(0, 10);
      inserir("lancamentos", { revendedora_id: R, tipo: "despesa", categoria: "Plataforma RevendIA", descricao: "Assinatura mensal", valor: 79.9, data: ref, status: "realizado" });
      inserir("lancamentos", { revendedora_id: R, tipo: "despesa", categoria: "Embalagens e brindes", descricao: "Sacolas e laços", valor: centavos(35 + rnd() * 30), data: ref, status: "realizado" });
    }

    // Operação em andamento: lote aberto, boleto a pagar e entregas de hoje
    const lote = inserir("lotes", { id: "lote_demo_aberto", revendedora_id: R, fornecedor: "boticario", status: "aberto", total_custo: 0, criado_em: somaDias(hoje, -1).toISOString(), atualizado_em: hoje.toISOString() });
    const loteAg = inserir("lotes", { id: "lote_demo_boleto", revendedora_id: R, fornecedor: "natura", status: "aguardando_pagamento", pedido_fornecedor_id: "NA" + Date.now().toString().slice(-8),
      total_custo: 312.4, previsao_chegada: somaDias(hoje, 5).toISOString(), criado_em: somaDias(hoje, -1).toISOString(), enviado_em: hoje.toISOString(), atualizado_em: hoje.toISOString() });
    const andamento = [
      { cli: clientes[0], status: "pronto_para_entrega", prods: [populares[0], populares[3]] },
      { cli: clientes[1], status: "em_entrega", prods: [populares[1]] },
      { cli: clientes[2], status: "aguardando_lote", prods: [populares[2]], lote: lote.id },
      { cli: clientes[5], status: "aguardando_pagamento", prods: produtos.filter((p) => p.fornecedor === "natura").slice(0, 3), lote: loteAg.id },
    ];
    andamento.forEach((a, i) => {
      const pid = `ped_demo_atual_${i}`;
      let total = 0, custo = 0;
      for (const p of a.prods) {
        inserir("itens_pedido", { pedido_id: pid, produto_id: p.id, fornecedor: p.fornecedor, sku: p.sku, nome: p.nome, qtd: 1, preco_unit: p.preco_catalogo, custo_unit: p.preco_custo, de_estoque: a.lote ? 0 : 1, lote_id: a.lote || null });
        total += p.preco_catalogo; custo += p.preco_custo;
      }
      inserir("pedidos", { id: pid, revendedora_id: R, cliente_id: a.cli.id, status: a.status, origem: "whatsapp", total: centavos(total), custo: centavos(custo),
        previsao_entrega: a.lote ? null : hoje.toISOString(), criado_em: somaDias(hoje, -i).toISOString(), atualizado_em: hoje.toISOString() });
      inserir("lancamentos", { revendedora_id: R, tipo: "receita", categoria: "Vendas", descricao: `Venda para ${a.cli.nome}`, valor: centavos(total), data: hoje.toISOString().slice(0, 10), pedido_id: pid, status: "previsto" });
      inserir("cobrancas", { revendedora_id: R, cliente_id: a.cli.id, pedido_id: pid, valor: centavos(total), vencimento: somaDias(hoje, 2).toISOString().slice(0, 10), status: "aberta", lembretes: i === 3 ? 3 : 0,
        pix_copia_cola: pixCopiaECola({ chave: "juliana.souza@email.com", nome: "Juliana Souza", cidade: "SAO PAULO", valor: centavos(total), txid: `RV${pid.slice(-10)}` }), criado_em: somaDias(hoje, -i).toISOString() });
      if (a.status === "em_entrega") inserir("entregas", { revendedora_id: R, pedido_id: pid, provedor: "simulado", provedor_id: "MOTO123456", status: "a_caminho", valor_frete: 12.9, motoboy_nome: "Carlos", criado_em: hoje.toISOString(), atualizado_em: hoje.toISOString() });
    });
    exec("UPDATE lotes SET total_custo = (SELECT COALESCE(SUM(custo_unit*qtd),0) FROM itens_pedido WHERE lote_id = lotes.id) WHERE revendedora_id = ?", R);
    const bol = inserir("boletos", { revendedora_id: R, lote_id: loteAg.id, fornecedor: "natura", valor: 312.4, vencimento: somaDias(hoje, 1).toISOString(),
      linha_digitavel: "23793.38128 60082.731296 54000.063305 1 98760000031240", status: "aberto", criado_em: hoje.toISOString() });
    inserir("lancamentos", { revendedora_id: R, tipo: "custo", categoria: "Compra de mercadoria", descricao: "Pedido Natura", valor: 312.4, data: somaDias(hoje, 1).toISOString().slice(0, 10), boleto_id: bol.id, status: "previsto" });

    // Marketing
    for (let i = 0; i < 9; i++) {
      const p = populares[i % populares.length];
      inserir("posts", { revendedora_id: R, produto_id: p.id, legenda: `✨ ${p.nome} — o queridinho das minhas clientes! Peça pelo WhatsApp 💛 #revendedora #perfume`, imagem: p.imagem, formato: "feed",
        objetivo: pick(["venda direta", "desejo/lifestyle", "prova social"]), agendado_para: somaDias(hoje, i < 6 ? -(i * 2 + 1) : i - 5).toISOString(), status: i < 6 ? "publicado" : "agendado",
        metricas_json: JSON.stringify(i < 6 ? { alcance: 400 + Math.floor(rnd() * 900), curtidas: 30 + Math.floor(rnd() * 80) } : {}), criado_em: somaDias(hoje, -14).toISOString() });
    }
    inserir("campanhas", { revendedora_id: R, nome: "Combo Malbec + Nativa SPA", tipo: "combo", descricao: "Os dois mais vendidos com 10% OFF", mensagem: "💛 Combo do ciclo: Malbec + Nativa SPA com 10% OFF!",
      produtos_json: "[]", desconto_pct: 10, publico: "todos", status: "concluida", enviada_em: somaDias(hoje, -10).toISOString(), resultado_json: JSON.stringify({ enviados: 25, pedidos: 7, receita: 1630.3 }), criado_em: somaDias(hoje, -10).toISOString() });

    // Comercial
    const leads = [["Paula Viana", "Perfume para presente de aniversário até R$ 200", 82], ["Rita Campos", "Hidratante Nativa SPA", 64], ["Sônia Prado", "Pediu catálogo", 38], ["Jéssica Moura", "Kit para o Dia das Mães (empresa, 15 unidades)", 90]];
    leads.forEach(([nome, interesse, score], i) => inserir("leads", { revendedora_id: R, nome, whatsapp: `55119770000${i}${i}`, origem: i === 3 ? "instagram" : "whatsapp", interesse, score,
      temperatura: score >= 70 ? "quente" : score >= 40 ? "morno" : "frio", estagio: i === 0 ? "qualificado" : "novo", cadencia: `lead_${score >= 70 ? "quente" : score >= 40 ? "morno" : "frio"}`,
      passo_cadencia: 1, proxima_acao_em: somaDias(hoje, 1).toISOString(), ultima_interacao_em: hoje.toISOString(), criado_em: somaDias(hoje, -i).toISOString() }));

    // Operações
    inserir("tickets", { revendedora_id: R, cliente_id: clientes[7].id, origem: "whatsapp", categoria: "troca", assunto: `troca — ${clientes[7].nome}`, descricao: "Quer trocar o batom por outro tom.",
      criticidade: "P3", status: "aberto", resposta: "Claro! Me diz qual tom você prefere que eu já separo 💛", sla_ate: somaDias(hoje, 1).toISOString(), criado_em: hoje.toISOString() });

    // Financeiro: extrato bancário para conciliar
    const d0 = hoje.toISOString().slice(0, 10);
    inserir("extrato", { revendedora_id: R, data: d0, descricao: `PIX RECEBIDO ${clientes[0].nome.toUpperCase()}`, valor: um("SELECT total FROM pedidos WHERE id = 'ped_demo_atual_0'").total, documento: "E1", status: "pendente", criado_em: hoje.toISOString() });
    inserir("extrato", { revendedora_id: R, data: d0, descricao: "COMPRA CARTAO PAPELARIA", valor: -42.5, documento: "E2", status: "pendente", criado_em: hoje.toISOString() });

    const evs = ["Catálogo O Boticário sincronizado: 12 produtos", "3 posts publicados no Instagram", "Campanha \"Combo Malbec + Nativa SPA\" enviada para 25 clientes",
      "Novo lead quente (90): Jéssica Moura — Kit para o Dia das Mães", "Pedido enviado à Natura. Boleto de R$ 312,40 vence amanhã.", "Motoboy chamado para Carla Mendes (R$ 12,90)"];
    evs.forEach((m, i) => inserir("eventos", { revendedora_id: R, tipo: "agente", mensagem: m, criado_em: new Date(Date.now() - (evs.length - i) * 2400000).toISOString() }));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
