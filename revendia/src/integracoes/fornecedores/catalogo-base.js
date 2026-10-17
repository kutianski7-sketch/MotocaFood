// Catálogo de referência por marca, usado pelo conector em modo demo/simulação.
// Preços aproximados de catálogo; o custo da revendedora é calculado pela margem do ciclo.
const P = (sku, nome, categoria, preco) => ({ sku, nome, categoria, preco_catalogo: preco });

export const CATALOGOS = {
  boticario: {
    nome: "O Boticário", minimoPedido: 199, margem: 0.3, prazoDias: 4,
    produtos: [
      P("BT-MALBEC-100", "Malbec Desodorante Colônia 100ml", "Perfumaria masculina", 189.9),
      P("BT-LILY-75", "Lily Eau de Parfum 75ml", "Perfumaria feminina", 299.9),
      P("BT-FLORATTA-75", "Floratta Rose Desodorante Colônia 75ml", "Perfumaria feminina", 139.9),
      P("BT-EGEO-DOLCE-90", "Egeo Dolce Desodorante Colônia 90ml", "Perfumaria feminina", 154.9),
      P("BT-ZAAD-95", "Zaad Eau de Parfum 95ml", "Perfumaria masculina", 239.9),
      P("BT-NATIVA-HID-400", "Nativa SPA Hidratante Ameixa 400ml", "Corpo e banho", 79.9),
      P("BT-NATIVA-MORANGO-200", "Nativa SPA Loção Morango Ruby 200ml", "Corpo e banho", 59.9),
      P("BT-MAKE-BASE", "Make B. Base Matte HD", "Maquiagem", 99.9),
      P("BT-INTENSE-BATOM", "Intense Batom Matte", "Maquiagem", 39.9),
      P("BT-CUIDE-SHAMPOO", "Cuide-se Bem Shampoo 250ml", "Cabelos", 34.9),
      P("BT-MEN-BARBA", "Men Gel de Barbear 120g", "Masculino", 39.9),
      P("BT-COFFEE-100", "Coffee Woman Seduction 100ml", "Perfumaria feminina", 169.9),
    ],
  },
  natura: {
    nome: "Natura", minimoPedido: 150, margem: 0.3, prazoDias: 5,
    produtos: [
      P("NT-ESSENCIAL-100", "Essencial Deo Parfum Feminino 100ml", "Perfumaria feminina", 249.9),
      P("NT-KAIAK-100", "Kaiak Clássico Masculino 100ml", "Perfumaria masculina", 169.9),
      P("NT-EKOS-MARACUJA", "Ekos Polpa Hidratante Maracujá 400ml", "Corpo e banho", 89.9),
      P("NT-TODODIA-AMORA", "Tododia Creme Amora e Flor de Laranjeira 400ml", "Corpo e banho", 64.9),
      P("NT-CHRONOS-30", "Chronos Sérum Antissinais 30ml", "Rosto", 149.9),
      P("NT-UNA-BATOM", "Una Batom Cremoso", "Maquiagem", 59.9),
      P("NT-LUNA-75", "Luna Deo Parfum 75ml", "Perfumaria feminina", 179.9),
      P("NT-HOMEM-ESSENCE", "Natura Homem Essence 100ml", "Perfumaria masculina", 199.9),
    ],
  },
  avon: {
    nome: "Avon", minimoPedido: 120, margem: 0.3, prazoDias: 6,
    produtos: [
      P("AV-FAR-AWAY-50", "Far Away Deo Parfum 50ml", "Perfumaria feminina", 89.9),
      P("AV-RENEW-30", "Renew Reversalist Creme 30g", "Rosto", 69.9),
      P("AV-COLOR-BATOM", "Avon Color Trend Batom", "Maquiagem", 19.9),
      P("AV-MUSK-90", "Musk Marine Colônia 90ml", "Perfumaria masculina", 49.9),
    ],
  },
  eudora: {
    nome: "Eudora", minimoPedido: 199, margem: 0.3, prazoDias: 4,
    produtos: [
      P("EU-SIAGE-SHAMPOO", "Siàge Shampoo Cauterização 250ml", "Cabelos", 49.9),
      P("EU-IMENSI-100", "Imensi Eau de Parfum 100ml", "Perfumaria feminina", 219.9),
      P("EU-NIINA-BATOM", "Niina Secrets Batom", "Maquiagem", 34.9),
    ],
  },
};

export const MARCAS = Object.entries(CATALOGOS).map(([id, c]) => ({ id, nome: c.nome, minimoPedido: c.minimoPedido }))
  .concat([{ id: "outra", nome: "Outra marca (catálogo manual)", minimoPedido: 0 }]);
