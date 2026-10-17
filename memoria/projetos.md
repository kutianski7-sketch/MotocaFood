# Projetos em andamento

## Motoca Food — a plataforma (projeto principal)
- **O que é:** a própria plataforma motocafood.com.br (ver [empresa.md](empresa.md)).
- **Status (17/10/2026):** no ar há 15 dias, 430 motocas cadastrados (São Paulo), nenhum parceiro ou anúncio ainda.
- **Próximos passos:**
  1. Crescer a base com marketing (influenciadores) até 10 mil cadastrados.
  2. Trazer os primeiros parceiros: telemedicina, advogados baratos, contadores, despachantes etc.
  3. Ao chegar a 10 mil: ativar a assinatura (anual de R$ 60 via Pix) e os anúncios de lojas.
  4. Expandir de São Paulo para o Brasil todo.
- **Metas:** 10 mil cadastrados até 30/12/2026; depois, 100 mil.
- **Ritmo necessário (cálculo de 17/10/2026):** o ritmo atual é de ~29 cadastros por dia (430 em 15 dias). Para chegar a 10 mil em 30/12 faltam 9.570 em 74 dias, ou seja, ~129 por dia: cerca de 4,5 vezes o ritmo atual.
- **Equipe:** Gabriel + Vitor + Mateus (sócios).
- **Sem registro:** prazo da meta de 100 mil, orçamento de marketing, como os parceiros entram no app e como são pagos.

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
