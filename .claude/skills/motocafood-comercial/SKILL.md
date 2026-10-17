---
name: motocafood-comercial
description: Prospecta e aborda patrocinadores e anunciantes do Motoca Food (marcas e lojas de capacete, equipamento, peças, pneus, seguro etc.), montando a proposta "preço especial pro Motoca em troca de divulgação", a primeira mensagem, as respostas às objeções e o follow-up, tudo registrado num funil em CSV. Use quando pedirem patrocínio, patrocinador, anunciante, parceria com marca, proposta comercial, prospecção de empresas, pitch ou abordagem de vendas do Motoca Food, mesmo sem citar o nome da skill.
---

# Comercial Motoca Food: patrocinadores

O comercial ainda não aborda ninguém. Esta skill leva de "tenho uma marca em mente" a "mensagem enviada e registrada", com uma proposta que responde, logo de cara, às duas travas mais comuns: **"o que eu ganho?"** e **"isso é golpe?"**.

## Quando usar

- Achar e qualificar marcas ou lojas para patrocinar o Motoca Food.
- Montar a proposta, a primeira mensagem, o follow-up ou a resposta a uma objeção.
- Atualizar o funil (`comercial/funil.csv`).

**Fora de escopo:** cadastrar restaurante (use a skill `motocafood-parceiros`) e conteúdo para os Motocas (use a skill `motocafood-conteudo`). A peça que divulga o patrocinador **depois do sim** sai pela skill `motocafood-conteudo`.

## A proposta padrão: "Parceiro Fundador"

Como o app é novo e ainda não há números de audiência para vender, a proposta não cobra mídia. Ela troca **oferta por divulgação**:

| O patrocinador dá | O Motoca Food dá |
|---|---|
| Um **preço especial só pro Motoca** (ex.: 10–15% off ou um valor fechado num produto), com um **cupom exclusivo** (`MOTOCAFOOD`) | Destaque no app na categoria certa, como **Parceiro Fundador** |
| Validade mínima de **60 dias** | Divulgação nos Reels, posts e grupos de WhatsApp dos Motocas (quantidade combinada, ex.: 1 Reels + 2 posts + 2 disparos) |
| Um contato para tirar dúvidas | **Relatório no fim**: quantas vezes o cupom foi usado (o próprio patrocinador confere nas vendas) |

Por que funciona:
- **"O que eu ganho?"** → Ele ganha venda direta para um público que **compra equipamento o tempo todo, porque trabalha com a moto**, e mede o resultado pelo cupom, sem pagar nada adiantado.
- **"É golpe?"** → **Não há cobrança, link de pagamento nem dado bancário.** Tudo combinado por escrito, com site (motocafood.com.br) e Instagram oficiais para conferir. Ele pode sair quando quiser.

Os valores da oferta são do patrocinador. Sugira, mas quem decide é ele.

## Passo a passo

1. **Escolha o alvo.** Dê prioridade a **lojas e distribuidores de São Paulo** (capital), que decidem rápido, antes de grandes fabricantes. Bons sinais: já vende para motoboy, tem loja física em SP, é ativo no Instagram e tem contato comercial público.
2. **Pesquise em 10 minutos:** o que vende, onde fica, se já tem promoção ou programa para motoboy e qual é o canal de contato **comercial público** (WhatsApp da loja, e-mail comercial, formulário "seja parceiro"). Anote a fonte de tudo.
3. **Qualifique** (tudo precisa ser "sim"):
   - O produto é útil para o Motoca no trampo?
   - É legal e seguro (capacete com certificação **INMETRO**, peça de procedência, nada de bebida alcoólica)?
   - Dá para oferecer preço especial?
   - Tem contato comercial público?
4. **Monte a proposta Parceiro Fundador** adaptada: sugira uma oferta concreta para o produto dele e diga o que o Motoca Food entrega e como ele mede.
5. **Escreva a primeira mensagem** (WhatsApp ou e-mail):
   - Até ~700 caracteres, com tom profissional e próximo (não é a gíria dos posts).
   - Estrutura: quem somos (1 linha) → por que ele (1 linha específica sobre a loja) → a proposta (2–3 linhas) → "sem custo e sem pagamento" → uma pergunta fácil de responder ("Posso te mandar a proposta de 1 página?").
6. **Prepare as respostas** para as objeções mais prováveis (veja abaixo).
7. **Planeje o follow-up:** no máximo **2 lembretes**, no 3º e no 7º dia, cada um trazendo algo novo. Sem resposta depois disso, o status vira `Sem resposta` e só volta em 60 dias.
8. **Registre no funil** `comercial/funil.csv` (separador `;`, UTF-8 com BOM):
   `empresa;categoria;cidade;contato_publico;fonte_contato;oferta_sugerida;status;data_ultimo_contato;proximo_passo;observacao`
   Os status possíveis são: `Pesquisado` → `Abordado` → `Em conversa` → `Fechado` / `Recusou` / `Sem resposta`.
9. **Nunca envie nada sozinho.** A skill entrega o texto pronto, e quem envia é a pessoa do comercial.

## Respostas às objeções

| Objeção | Resposta |
|---|---|
| "Quantos usuários vocês têm?" | Responda com o número real, se o usuário tiver passado. Se não, seja honesto: "Estamos começando. Por isso não cobramos nada: você só paga com o desconto quando o Motoca compra, e mede pelo cupom." |
| "Quanto custa?" | "Nada. Nesta fase o Parceiro Fundador não paga mídia. A contrapartida é o preço especial pro Motoca." |
| "Já dou desconto pra todo mundo." | "Então é só deixar o desconto com o cupom MOTOCAFOOD, e você passa a saber quantas vendas vieram dos motoboys." |
| "Isso é golpe?" | "Faz sentido perguntar. Não pedimos pagamento nem dados bancários. Confere a gente em motocafood.com.br e no nosso Instagram, e eu te mando tudo por escrito." |
| "Me manda por e-mail." | Mande a proposta de 1 página e marque o follow-up para o 3º dia. |

## Exemplo (formato da entrega)

> **Alvo:** loja de capacetes e acessórios em SP, com loja física e WhatsApp comercial no site.
> **Oferta sugerida:** 10% em capacetes certificados e 15% em capas de chuva com o cupom MOTOCAFOOD, por 60 dias.
> **Primeira mensagem:** "Oi, tudo bem? Sou [NOME], do Motoca Food, um app de descontos feito só para motoboys de São Paulo..."
> **Funil:** `[Loja];capacete/equipamento;São Paulo;WhatsApp (site);https://...;10% capacete + 15% capa de chuva;Pesquisado;2026-10-17;enviar 1ª mensagem;`

(A rodada real fica em `comercial/`.)

## O que nunca fazer

- **Nunca inventar números**: usuários, downloads, seguidores, vendas ou "X Motocas usam". Sem número real, use a honestidade do "estamos começando" ou um marcador `[Nº REAL]`.
- **Nunca prometer resultado** ("você vai vender 100 capacetes"). Prometa entregas (Reels, posts, destaque) e a medição pelo cupom.
- **Nunca pedir pagamento, Pix ou dado bancário** nesta fase, nem mandar link de pagamento. É o que faz parecer golpe.
- **Nunca dizer que outra marca já é parceira** se ela não estiver como `Fechado` no funil.
- **Nunca usar nome, logo ou foto da marca** em post ou no app antes do "sim" por escrito.
- **Nunca aceitar** produto sem certificação (capacete sem INMETRO), bebida alcoólica, aposta ou qualquer coisa que incentive pressa e risco na pista.
- **Nunca fazer spam**: nada de disparo em massa, lista comprada, contato pessoal de funcionário achado em rede social ou mais de 2 follow-ups.
- **Nunca enviar mensagem em nome do usuário.** A skill escreve, e a pessoa envia.
