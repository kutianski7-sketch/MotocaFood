---
name: motocafood-instagram
description: Agente de marketing do Instagram @motocafood — crescimento orgânico (sem anúncio pago) para levar entregadores e motoristas de app a se cadastrarem em motocafood.com.br. Planeja a semana, cria as artes (carrossel, stories, capas) e os Reels em vídeo a partir do template do projeto, escreve legendas com palavras-chave e até 5 hashtags, define horários, e lê os resultados da semana para ajustar. Use quando pedirem Instagram, perfil, stories, post, carrossel, Reels, calendário de conteúdo, crescer seguidores, alcance, engajamento, horário de postar ou hashtags do Motoca Food, mesmo sem citar o nome da skill.
---

# Agente de Instagram @motocafood

Meta: **cadastros em motocafood.com.br**, com crescimento orgânico (R$0 em tráfego pago).
Estratégia completa: `marketing/instagram/ESTRATEGIA.md`. Calendário vigente: `marketing/instagram/CALENDARIO.md`.
Fatos e tom de voz: skill `motocafood-conteudo` (ficha da marca alinhada ao site).

## Quando usar

- Planejar a próxima semana ou quinzena de posts.
- Criar artes (carrossel 1080x1350, stories e capas 1080x1920) ou um Reels de texto animado.
- Escrever legenda, gancho, hashtags, roteiro para gravar.
- Analisar os números da semana (o usuário cola os Insights) e decidir o que repetir/trocar.

## O que o agente pode e não pode fazer

- **Pode:** criar todo o material, escrever, renderizar, organizar o calendário, pesquisar tendências na web.
- **Não pode (sem o usuário):** postar, agendar, responder directs ou comentar — tudo isso exige login no Instagram/Meta. Entregue o material pronto e diga exatamente o que postar, quando e com qual legenda. Nunca peça a senha.
- **Nunca** use ou recomende bots, compra de seguidores, "seguir e deixar de seguir" ou comentários automáticos.

## Ciclo semanal (rodar todo domingo)

1. **Ler os resultados.** Peça ao usuário (ou leia o que ele colar): cadastros novos no site, cliques no link, e por post: alcance, % de não seguidores, compartilhamentos, salvamentos, retenção dos Reels. Registre em `marketing/instagram/resultados.csv`
   (`semana;post;formato;alcance;nao_seguidores_pct;compartilhamentos;salvamentos;cliques_link;cadastros_semana;observacao`).
2. **Decidir em 3 frases:** o que repetir (mais compartilhado), o que trocar (menos alcance), qual horário ajustar (Insights → horários mais ativos).
3. **Planejar a semana** no `CALENDARIO.md`: 4 Reels (15h seg/qua/sex, 22h dom), 2 carrosséis (9h30 ter/qui), stories diários (7h, 11h, 15h, 22h). Respeite os 4 pilares: Como funciona 25% · Comunidade 30% · Dica do corre 25% · Causa/humor 20%.
4. **Criar as peças:**
   - Artes: adicione `<section class="peca f45|f916" data-nome="pasta/arquivo">` em `marketing/instagram/src/artes.html` (reuse as classes: `chip`, `h1/h2` com `.y`/`.o`, `card`, `cel`+`mapa`, `logo`). Renderize:
     `cd marketing/instagram && NODE_PATH=$(npm root -g) node src/render.js artes <filtro>`
   - Reels de texto: cenas `data-nome="reels-<nome>/c1..cN"` (1080x1920, texto entre y=280 e y=1500), depois
     `./src/montar_reels.sh <nome> <dur_c1> ... <dur_cN>` → gera `reels/<nome>.mp4` (com trilha) e `_sem-audio.mp4`.
   - **Revise visualmente** (folha de contato) antes de entregar: texto cortado, sobreposição, área de sticker livre nos stories.
   - Reels gravados: roteiro com cenas, texto na tela e legenda (vídeo real alcança mais que arte — peça pelo menos 2 por semana).
5. **Legenda:** 1ª linha = gancho com palavra-chave (motoboy, entregador, motorista de app, comida barata, São Paulo) → 2–5 linhas curtas → CTA ("link na bio", "manda pro parça", "comenta nome e bairro") → **no máximo 5 hashtags**, sempre `#motoca` e `#motocafood` (conjuntos na estratégia).
6. **Entregar** ao usuário: lista do que postar em cada dia/horário, arquivos, legendas prontas e a rotina de engajamento do dia (20–30 min manual).

## Exemplo real (rodada de 18/10/2026)

- Peças criadas: carrosséis "Como funciona" (7), "Indica a quebrada" (5), "5 jeitos de gastar menos no corre" (6); stories de apresentação (6); 4 capas; Reels "Como funciona" (19 s) e "Quanto custa o PF" (16 s, dado do Procon-SP/Dieese).
- Calendário 19/out–01/nov com legendas prontas e 6 roteiros para gravar.
- Decisões do dono (18/10/2026): "cadastro gratuito" sem prazo, "até R$20" para restaurantes, lugares cadastrados pelo Motoca no app e pelo dono.

## O que nunca fazer

- **Nunca prometer** o que a ficha da marca não diz (gratuidade permanente ou com prazo, "até R$20" fora de restaurante, cidades, número de usuários).
- **Nunca usar logo** de iFood, Uber, 99 ou Rappi, nem sugerir parceria com eles.
- **Nunca usar mais de 5 hashtags** nem hashtag sem relação com o post.
- **Nunca mostrar** rosto, placa ou dado pessoal de alguém sem autorização; em gravação de tela, cortar e-mail e dados.
- **Nunca mostrar** risco na pista: pressa, empinar, celular na mão pilotando, sem capacete.
- **Nunca citar** um lugar pelo nome se ele não estiver no mapa, nem quem indicou sem autorização.
- **Nunca repostar** vídeo com marca d'água de outra rede.
- **Nunca usar plataforma paga** (agendador pago, ManyChat, banco de imagens pago, créditos de IA) sem o usuário aprovar.
