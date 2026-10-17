---
name: motocafood-parceiros
description: Pesquisa na internet restaurantes da cidade de São Paulo que vendem almoço ou jantar (PF, prato feito, marmita, comercial, self-service por quilo com preço fixo) por até R$20 e entrega uma planilha CSV pronta para cadastrar no Motoca Food, com preço conferido, fonte e data. Use quando pedirem para achar, buscar, levantar, prospectar ou listar restaurantes, PFs ou marmitas baratas, ou novos parceiros do Motoca Food, mesmo sem citar o nome da skill.
---

# Prospecção de restaurantes até R$20 (São Paulo)

Hoje os restaurantes são achados com ajuda de IA e cadastrados direto na plataforma, sem contato prévio.
Esta skill padroniza a busca para que só entre no app o que tem preço conferido, com fonte e data, e marca o que ainda não é parceiro de verdade.

## Quando usar

- Pedirem para achar ou listar restaurantes, PFs ou marmitas por até R$20 em São Paulo.
- Pedirem "novos parceiros" ou para "levantar restaurantes" de um bairro ou zona.
- Chegarem indicações de Motocas (nome + bairro) e for preciso conferir se o lugar se encaixa.

**Fora de escopo:** borracharias, mecânicos e guinchos (o critério de preço é outro), cidades fora de SP e a escrita de posts (para isso, use a skill `motocafood-conteudo`).

## O critério

Entra na lista o lugar que atende **tudo** isto:

1. Fica na **cidade de São Paulo** (capital, não a Grande SP).
2. Vende **almoço ou jantar completo** por **até R$20,00**: PF, prato feito, comercial, marmita ou prato do dia. Salgado, lanche, combo de fast-food e "a partir de" sem prato completo não contam.
3. O preço foi visto em uma fonte **dos últimos 6 meses**: Google Maps (foto de cardápio ou avaliação), Instagram do lugar ou iFood/outro app.
4. Aparece como **aberto** no Google Maps (não "fechado permanentemente").

Self-service por quilo só entra se a fonte mostrar uma refeição normal saindo por até R$20 (ex.: preço do kg ≤ R$50 para uns 400 g). Nesse caso, explique a conta na coluna `observacao`.

No iFood, o preço costuma ser mais alto do que no balcão. Se ali estiver ≤ R$20, no balcão está ≤ R$20 também. Se estiver acima, isso **não** descarta o lugar: procure outra fonte.

## Passo a passo

1. **Recorte.** Defina o bairro ou a zona. Se não vier nada, comece pelo **Centro** (Sé, República, Bom Retiro, Brás), onde há muito Motoca rodando. Quantidade padrão: 10 lugares.
2. **Busque** com termos de quem procura comida barata, variando entre eles: `PF barato [bairro]`, `prato feito R$15 [bairro]`, `marmitex [bairro] preço`, `comercial almoço [bairro]`, `restaurante popular [bairro]`. Inclua os **Bom Prato** da região (refeição a R$1, programa do governo de SP) em uma linha separada, com `tipo = Bom Prato`, porque eles não viram parceiros.
3. **Confira o preço de cada lugar** na fonte original (abra a página e não confie em resumo de busca). Anote o valor, o que vem no prato, o link e a data da fonte.
4. **Dê uma nota de confiança:**
   - `alta`: preço visto em 2 fontes, ou no Instagram/cardápio oficial nos últimos 3 meses.
   - `media`: 1 fonte dos últimos 6 meses.
   - `baixa`: fonte mais velha, preço incerto ou "acho que é" → **não vai para o cadastro**. Fica numa aba ou lista à parte, como "a confirmar".
5. **Junte os dados de cadastro:** nome, endereço com bairro, zona, horário (almoço/jantar e dias) e contato (telefone/WhatsApp/Instagram), sempre de fonte pública do próprio lugar.
6. **Gere o CSV** (separador `;`, UTF-8 com BOM, para abrir certo no Excel) com estas colunas, nesta ordem:

   `nome;endereco;bairro;zona;refeicao;o_que_vem;preco;horario;telefone;instagram;fonte_preco;data_fonte;confianca;status;observacao`

   - `refeicao`: almoço, jantar ou almoço e jantar.
   - `preco`: número com vírgula, ex.: `18,00`.
   - `status`: sempre **`Encontrado`** ao sair da busca. Só a equipe muda para `Contatado` ou `Parceiro confirmado`.
   - Salve como `parceiros/AAAA-MM-DD_[bairro].csv`.
7. **Resuma na conversa:** quantos lugares entraram, quantos ficaram "a confirmar" e por quê, e os 3 mais promissores para contatar primeiro.

## Exemplo de linha

```
nome;endereco;bairro;zona;refeicao;o_que_vem;preco;horario;telefone;instagram;fonte_preco;data_fonte;confianca;status;observacao
Restaurante Exemplo;Rua Exemplo, 100;Brás;Centro;almoço;arroz, feijão, bife, salada e fritas;18,00;seg–sáb 11h–15h;(11) 90000-0000;@exemplo;https://instagram.com/p/...;2026-09-20;alta;Encontrado;preço também visto em avaliação do Google de ago/2026
```

(É uma linha ilustrativa. Na planilha de verdade, todo dado tem que ter vindo de uma fonte.)

## O que nunca fazer

- **Nunca inventar** restaurante, endereço, telefone ou preço. Se não achou, a célula fica vazia ou a linha não entra.
- **Nunca usar preço sem fonte e data**, nem preço "estimado" pela IA.
- **Nunca marcar como `Parceiro confirmado`** um lugar com quem ninguém falou. "Cadastrado" não é "parceiro".
- **Nunca chamar de desconto** o preço normal do balcão. A planilha registra o preço, e desconto só existe se o restaurante combinar.
- **Nunca incluir** lugar fechado permanentemente, fora da capital ou que só vende lanche.
- **Nunca coletar** dados pessoais de funcionários ou clientes (nome de dono tirado de avaliação, celular pessoal). Use só o contato público do estabelecimento.
- **Nunca usar** este levantamento para dizer em post que o lugar "é parceiro". O marketing só cita quem está como `Parceiro confirmado`.
