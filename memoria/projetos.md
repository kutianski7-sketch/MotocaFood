# Projetos em andamento

## Motoca Food — a plataforma (projeto principal)
- **O que é:** a própria plataforma motocafood.com.br (ver [empresa.md](empresa.md)).
- **Status (17/10/2026):** no ar há 15 dias, 430 motocas cadastrados (São Paulo), nenhum parceiro ou anúncio ainda.
- **Próximos passos:**
  1. Crescer a base com marketing (influenciadores) até 10 mil cadastrados.
  2. Trazer os primeiros parceiros: telemedicina, advogados baratos, contadores, despachantes etc.
  3. Ao chegar a 10 mil: ativar a assinatura (anual de R$ 60 via Pix) e os anúncios de lojas.
  4. Expandir de São Paulo para o Brasil todo (campanhas já começando em Salvador, Curitiba, Fortaleza e Rio de Janeiro).
- **Metas:** 10 mil cadastrados até 30/12/2026; 100 mil até dezembro de 2026.
  - Confirmado em 17/10/2026: os 100 mil são para dezembro de 2026. O Gabriel reconhece que é ousado e pretende investir pesado em marketing.
- **Lançamento do app:** 17/10/2026.
- **Ritmo necessário (cálculo de 17/10/2026, ritmo atual ~29 cadastros/dia):**

| Meta | Faltam | Dias | Cadastros/dia | Vezes o ritmo atual | Custo máximo por cadastro com R$ 1.000/semana |
|---|---|---|---|---|---|
| 10 mil até 30/12/2026 | 9.570 | 74 | ~129 | ~4,5x | ~R$ 1,10 |
| 100 mil até 31/12/2026 | 99.570 | 75 | ~1.330 | ~46x | ~R$ 0,10 |

- **Custo por cadastro real até 17/10/2026:** ~R$ 0,70 (R$ 300 para 430 cadastros).
  - Mantido esse custo, R$ 1.000 por semana renderiam ~1.430 cadastros por semana (~204 por dia).
  - Isso basta para os 10 mil até 30/12, que pedem ~129 por dia.
  - Para os 100 mil seriam precisos ~R$ 70 mil no total; em 2026 só fecha com um custo por cadastro de ~R$ 0,10.
  - Ressalva: o custo por cadastro costuma subir quando a campanha cresce e chega a cidades novas.
- **O que os 100 mil exigem (cálculo de 17/10/2026):**
  - Pelo resultado do @l.vinis (~250 cadastros por Reels, 0,57% das views), seriam ~400 Reels desse nível, ~37 por semana, ou ~17,5 milhões de views no total.
  - A ~R$ 0,70 por cadastro, seriam ~R$ 70 mil em ~11 semanas (~R$ 6.500 por semana), contra os R$ 1.000 por semana planejados.
  - Com 20 influenciadores a 1 Reels por semana cada, no nível do @l.vinis: ~5 mil cadastros por semana, chegando a ~55 mil no fim de dezembro.
- **Marketing:** R$ 1.000 por semana em influenciadores (equivale a 10 influenciadores por semana ao preço atual de R$ 100); SP mais Salvador, Curitiba, Fortaleza e Rio de Janeiro.
- **Equipe:** Gabriel + Vitor + Matheus (sócios).

## Motoca Food — vídeo Reels de lançamento
- **Entregável:** `video/motocafood_reels.mp4` — Instagram, 1080x1920, 30 fps, ~45 s, -14 LUFS.
- **Conteúdo:** cenas animadas com narração e legendas; no final o Motoca fala (lip-sync) e fecha com a cartela da marca e motocafood.com.br.
- **Como regerar:** ver `video/README.md`.
- **Status:** versão pronta no repositório.

## Aposentadoria — carteira de renda passiva (EUA)
- **Objetivo:** gerar renda mensal-alvo equilibrando renda, crescimento e exposição especulativa.
- **Alocação em 4 partes:**

| Parte | Função | Ativos |
|---|---|---|
| Renda fixa | âncora de renda | SGOV, SHY, IEF (Treasuries) |
| Dividendos | renda | SCHD, VYM, DGRO |
| Crescimento | valorização | VOO, QQQ + blue chips |
| Bitcoin | especulativo, alta volatilidade | IBIT, FBTC (ETFs spot) |

- **Status:** alocação um pouco abaixo da meta de renda mensal; calibragem de pesos em andamento.
- **Caminhos para fechar a diferença:** (a) mais peso em ativos de maior yield; (b) realizar ganhos seletivamente no crescimento.
- **Próximo passo em aberto:** projeções por cenário (conservador, moderado, agressivo) — oferecidas, não feitas.
- **Aprendizados:**
  - Treasuries e dividendos têm tratamento tributário diferente.
  - Bitcoin e crescimento não geram renda direta; servem para valorização e diversificação.
  - Rebalanceamento anual mantém os pesos-alvo.
  - Renda excedente pode ser reinvestida para compor o principal.
- **Sem registro:** valor em caixa, renda mensal-alvo, pesos atuais.
- Conteúdo tratado como educacional, não como recomendação financeira.

## Investments Trade — screener técnico multi-timeframe
- **Objetivo:** achar ações/ETFs dos EUA saindo de sobrevenda, para swing/position trading.
- **Critérios:**
  - Mensal: Stochastic RSI cruzando para cima a partir de sobrevenda
  - Mensal: histograma do MACD saindo do vermelho escuro rumo ao verde
  - Semanal: preço ≥ EMA 200
- **Restrição:** TradingView é o preferido, mas não há integração disponível.
- **Decisão em aberto:** fonte de dados — Alpha Vantage ou IBKR.
- **Próximo passo possível:** screener programático replicando o setup do TradingView.
- **Sem registro:** universo de ativos a varrer, frequência de execução.

## Migração de memória
- Concluída em 17/10/2026: memória da IA anterior consolidada em `memoria/`.
