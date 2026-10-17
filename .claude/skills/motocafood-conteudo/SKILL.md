---
name: motocafood-conteudo
description: Escreve conteúdo de marketing do Motoca Food para motoboys (roteiro de Reels/TikTok, legenda de post/carrossel e mensagem de WhatsApp) no tom de voz da marca, já pronto para publicar, sem precisar reescrever o que a IA entregou. Use sempre que pedirem post, Reels, vídeo, legenda, carrossel, texto de WhatsApp, divulgação ou campanha do Motoca Food, mesmo que não citem o nome da skill.
---

# Conteúdo Motoca Food (para Motocas)

Hoje o conteúdo sai de uma IA e depois é corrigido à mão para soar como o Motoca Food.
Esta skill existe para que a primeira versão já saia no tom e com os fatos certos.

## Quando usar

- Pedirem **roteiro de Reels/TikTok**, **legenda de post/carrossel** ou **mensagem de WhatsApp** do Motoca Food.
- O público é o **motoboy** (o "Motoca"): baixar o app, usar os descontos, indicar parceiros.
- Pedirem "o mesmo tema em vários formatos": entregue os três, coerentes entre si.

**Não use** para abordar dono de restaurante ou oficina, para anúncio pago ou para texto jurídico.
Nesses casos, avise que a skill é para falar com o Motoca e pergunte se quer seguir assim mesmo.

## Ficha da marca (a única fonte de fatos)

| O que é | Central de parceiros com descontos para motoboys. "O primeiro e único app que se importa de verdade com o Motoca." |
|---|---|
| 1ª fase (já tem) | Restaurantes com almoço e jantar **por até R$20**; borracharias, mecânicos e guinchos baratos |
| Em breve | Postos de gasolina, advogados, médicos e contadores com preço baixo |
| Preço | **Acesso gratuito** para o Motoca e para os parceiros |
| Papel do Motoca | **Agente multiplicador**: chama o restaurante onde já come, o borracheiro e o mecânico pra virar parceiro |
| Como indicar | O Motoca manda **nome + bairro** do lugar (nos comentários ou no direct). Não existe link nem formulário de indicação. |
| Como o parceiro entra | A equipe pesquisa os lugares (com ajuda de IA), **confere se o almoço/jantar sai por até R$20** e cadastra na plataforma. O Motoca não cadastra nada. |
| Cidade foco | **São Paulo (capital)** neste início. Nada de falar como se o app já estivesse em outras cidades. |
| Causa | "Chegou a hora de o Motoca ter qualidade de vida e ser ouvido!" |
| Site | motocafood.com.br |

Fato que não está nesta tabela (nome de parceiro, bairro, preço exato, data, cupom, @ ou número de contato) **só entra se o usuário informar**.
Se precisar dele e ele não veio, deixe um marcador visível, como `[@ DO INSTAGRAM]` ou `[NOME DO RESTAURANTE]`, e liste o que falta no final.
Parceiro citado pelo nome tem que estar com status **`Parceiro confirmado`** na planilha da skill `motocafood-parceiros` (restaurante só "Encontrado" ou "cadastrado" não conta). Preço achado na internet ou por IA é só pista, não fato.

## Tom de voz: gíria de motoboy

- Chame o público de **Motoca / Motocas**. Nunca use "cliente", "usuário" ou "entregador parceiro".
- Abertura de assinatura: **"Fala, Motocas!"** (ou "Fala, Motoca!" se for para uma pessoa só).
- Fechamento de assinatura: **"Bora acelerar, Motoca! Chegou a nossa vez!"**
- Linguagem de rua e de corredor: "pra", "tá", "corre", "rolê", "na pista", "no grau", "parça", "rango", "bater o rango". Escreva como um Motoca falando com outro, não como uma empresa falando com o público.
- Sotaque de São Paulo, sem exagero: "mano", "quebrada", "da hora", "trampo". Cite as regiões pelo nome que o Motoca usa (zona leste, zona sul, centro, Marginal) quando ajudar.
- A ação de indicar é sempre simples: **"comenta o nome e o bairro"** ou **"manda no direct"**. Nunca peça para baixar algo, preencher formulário ou cadastrar o restaurante.
- Frases curtas, uma ideia por frase. Na fala, nada que trave a língua.
- O Motoca é protagonista e dono da causa ("a nossa vez"), nunca coitado.

## Passo a passo

1. **Pegue o briefing.** Tema, formato(s), dados reais (parceiro, bairro, preço, link) e prazo. Se faltar tema ou formato, pergunte uma vez. O resto vira marcador `[...]`.
2. **Defina UMA mensagem e UMA ação.** Escreva em uma linha: "Quero que o Motoca ___ e faça ___". Tudo o que não serve a isso fica de fora.
3. **Confira os fatos na ficha.** Todo número e toda promessa da peça precisam estar na ficha ou no briefing.
4. **Escreva cada formato com a sua forma:**
   - **Reels/TikTok (30–45 s):** tabela com `tempo | fala (narração) | texto na tela | cena`.
     Gancho em até 2 s ("Fala, Motocas!" + a dor ou o benefício). Texto na tela com no máximo 4 palavras por cartela, em CAIXA ALTA nos destaques.
     A narração deve ter entre 90 e 120 palavras para 45 s. Feche com a assinatura e com a cartela motocafood.com.br.
     Se o vídeo for gerado pelo pipeline de `video/` (`tts.py`), dê também a grafia de pronúncia de "Motoca Food" como **"Motoca Fúd"** e de "app" como **"ápi"**.
   - **Legenda de post/carrossel:** a 1ª linha é o gancho (aparece antes do "mais"). Depois, de 3 a 6 linhas curtas, a ação clara e 3 a 5 hashtags no fim (#MotocaFood #Motoboy #Motocas #MotoboySP + bairro/zona, se houver).
     No carrossel, descreva slide a slide (máx. 7), com no máximo 12 palavras por slide.
   - **WhatsApp:** pronto para encaminhar em grupo. Até ~600 caracteres, *negrito* do WhatsApp em 1 ou 2 destaques, no máximo 3 emojis e o link ou a ação no final. Precisa fazer sentido para quem recebe encaminhado sem contexto.
5. **Revise com o checklist** (todas as respostas precisam ser "sim"):
   - Tem "Motoca" e a gíria certa, sem "cliente" nem "usuário"?
   - Só tem fatos da ficha ou do briefing?
   - Tem uma ação clara?
   - O Reels cabe no tempo, contando as palavras?
   - Os marcadores `[...]` estão listados no fim?
6. **Entregue** os formatos prontos para colar, seguidos de "Falta você me passar:" com os marcadores pendentes e de 1 ou 2 variações de gancho para teste A/B.

## Exemplo real (Reels de lançamento, `video/`)

Narração aprovada e publicada, com 45 s:

> Fala, Motocas! Chegou o Motoca Food, o primeiro e único app que se importa de verdade com o Motoca!
> Uma central de parceiros com descontos pra facilitar sua vida.
> Nessa primeira fase, restaurantes pro Motoca comer barato, com almoço e jantar por até vinte reais,
> além de borracharias, mecânicos e guinchos baratos.
> Em breve, postos de gasolina, advogados, médicos e contadores com preços muito baratos pros Motocas.
> E você, Motoca, é o agente multiplicador: chama aquele restaurante onde você já come, aquele borracheiro e mecânico pra virar parceiro.
> O acesso é gratuito pra você Motoca e pros parceiros.
> Chegou a hora de o Motoca ter qualidade de vida e ser ouvido! Bora acelerar, Motoca! Chegou a nossa vez!

Texto na tela, por cartela: `FALA, MOTOCAS!` → `MOTOCA FOOD` → `1º E ÚNICO ❤️` → `% descontos de verdade` → `ATÉ R$20` → `🛞 Borracharias / 🔧 Mecânicos / 🛻 Guinchos` → `EM BREVE` → `Você, Motoca, é o agente multiplicador`.

Por que funciona: abre com a assinatura, traz um número concreto (R$20), dá ao Motoca um papel ("agente multiplicador") e fecha com causa e assinatura.

## O que nunca fazer

- **Nunca inventar** parceiro, bairro, preço, desconto em %, cupom, data ou número de usuários. Na dúvida, use um marcador `[...]`.
- **Nunca anunciar** restaurante como parceiro, nem prometer desconto nele, antes de ele estar como `Parceiro confirmado` (alguém da equipe falou com o lugar e ele topou).
- **Nunca falar** como se o app já atendesse fora da cidade de São Paulo.
- **Nunca prometer** o que ainda é "em breve" (postos, advogados, médicos, contadores) como se já existisse.
- **Nunca cobrar nem insinuar custo**: o acesso é gratuito para o Motoca e para os parceiros.
- **Nunca incentivar** pressa, excesso de velocidade, manobra arriscada, celular na mão pilotando ou furar sinal. "Bora acelerar" é sobre a causa, não sobre a pista. Cenas sempre com capacete.
- **Nunca atacar concorrentes** pelo nome (iFood, Rappi, Uber, 99 etc.). Fale do que o Motoca Food faz, não do que os outros não fazem.
- **Nunca tratar o Motoca como coitado** nem usar linguagem de ONG ou de pena. É orgulho, não caridade.
- **Nunca usar tom corporativo** ("prezado", "usuário", "solução", "plataforma inovadora").
- **Nunca entregar só uma ideia solta**: a peça sai pronta para colar ou gravar.
