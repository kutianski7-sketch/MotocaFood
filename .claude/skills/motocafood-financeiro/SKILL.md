---
name: motocafood-financeiro
description: Organiza o financeiro do Motoca Food (MEI com conta PJ). Monta e atualiza o fluxo de caixa de 12 meses, registra entradas e saídas, faz o fechamento do mês e responde "quanto tempo o dinheiro dura" e "quanto preciso aportar". Cuida também das obrigações do MEI (DAS, limite de faturamento, declaração anual). Use quando falarem de fluxo de caixa, financeiro, gastos, despesas, custos, saldo, orçamento, quanto falta, aporte, runway, DAS, MEI, fechamento do mês ou planilha financeira, mesmo sem citar o nome da skill.
---

# Financeiro Motoca Food: fluxo de caixa (MEI)

Hoje não existe controle financeiro. A operação é bancada com dinheiro próprio e custa entre R$1 mil e R$3 mil por mês, com gastos em app/tecnologia, marketing, ferramentas e pessoas.
Esta skill cria e mantém **uma planilha só** (`financeiro/fluxo_caixa.xlsx`), que responde três perguntas todo mês: **quanto tem**, **quanto queima** e **até quando dura**.

## Quando usar

- Criar ou atualizar o fluxo de caixa.
- Lançar gastos e entradas (colando extrato, comprovantes ou uma lista solta).
- Fazer o fechamento do mês.
- Simular decisões: "posso contratar mais um freela?", "e se eu dobrar os anúncios?", "quanto preciso aportar até [mês]?".
- Tirar dúvida sobre DAS, limite do MEI ou declaração anual (resposta prática, não consultoria tributária).

## A planilha (gerada por `scripts/gerar_fluxo.py`)

| Aba | Para quê |
|---|---|
| **Premissas** | Saldo inicial da conta PJ, reserva mínima (em meses) e o valor mensal previsto de cada categoria. **As células amarelas são as que você edita.** |
| **Lançamentos** | O que realmente entrou e saiu: data, tipo, categoria, descrição, valor, forma de pagamento e comprovante. |
| **Fluxo 12 meses** | Previsto mês a mês (entradas, saídas, resultado, saldo final), a linha "saídas realizadas" (puxada dos Lançamentos) e um alerta quando o saldo fura a reserva. |
| **Resumo** | Saldo final do período, queima média, **runway em meses**, menor saldo, **aporte necessário** para nunca ficar abaixo da reserva e o primeiro mês em que o saldo fica abaixo da reserva. |

Para gerar a planilha:
`python3 .claude/skills/motocafood-financeiro/scripts/gerar_fluxo.py financeiro/fluxo_caixa.xlsx AAAA-MM`
Depois, recalcule (LibreOffice) antes de abrir em visualizadores que não calculam.

### Categorias (use sempre estas)

- **Entradas:** `Aporte do titular`, `Patrocínio`, `Outras receitas`.
- **Saídas:** `Impostos (DAS-MEI)`, `App/tecnologia`, `Marketing`, `Ferramentas/assinaturas`, `Pessoas`, `Tarifas bancárias`, `Anuais/pontuais`, `Imprevistos`.

## Passo a passo

1. **Separe as contas.** Tudo da empresa entra e sai **pela conta PJ**. Dinheiro do seu bolso entra por Pix da sua conta PF para a PJ e é lançado como `Aporte do titular`. O seu PF nunca paga conta da empresa.
2. **Monte as premissas.** Pergunte o saldo atual da conta PJ e o valor e o dia de cada gasto recorrente. O que não for informado entra como **estimativa em amarelo**, com a observação "ESTIMATIVA: substitua".
3. **Gere a planilha** com o script e confira se as células amarelas batem com o que o usuário passou.
4. **Lance o realizado toda semana** (sexta é um bom dia), a partir do extrato da conta PJ. Uma linha por movimento, com a categoria da lista e o comprovante guardado.
5. **Feche o mês** (até o dia 5 do mês seguinte):
   - O saldo do extrato bate com o da planilha? Se não bater, ache a diferença antes de seguir.
   - Compare previsto e realizado por categoria. Desvio de mais de 20% → ajuste a premissa.
   - Atualize as premissas com a **média dos últimos 3 meses reais**.
   - Anote os 3 números no topo do Resumo: **saldo**, **queima do mês** e **runway**.
6. **Leia o Resumo e diga a decisão em uma frase**, por exemplo: "Com R$X na conta e queima de R$Y, o dinheiro dura Z meses. Para manter 2 meses de reserva até [mês], aporte R$W."
7. **Antes de cada gasto novo e recorrente** (freela, ferramenta, anúncio fixo), simule na aba Premissas e mostre o novo runway antes de decidir.
8. **Cumpra as obrigações do MEI**:
   - **DAS mensal**: vence todo dia 20 (para serviços, em 2026, R$86,05 = 5% do salário mínimo de R$1.621 + R$5 de ISS; o valor muda todo ano com o mínimo).
   - **Limite de faturamento**: R$81 mil por ano. O `Aporte do titular` **não** conta como faturamento, mas patrocínio e outras receitas contam. Avise quando a soma do ano passar de 80% do limite.
   - **Declaração anual (DASN-SIMEI)**: até 31 de maio, referente ao ano anterior.
   - **Nota fiscal**: receita de patrocínio pede nota de serviço (NFS-e). Confirme o procedimento com o contador.

## Exemplo real

Rodada de outubro de 2026 (`financeiro/fluxo_caixa.xlsx`, período nov/2026 a out/2027):
- O saldo inicial não foi informado, então ficou R$0 (em amarelo).
- Gasto mensal estimado em ~R$2.036, no meio da faixa de R$1–3 mil informada: DAS R$86,05 (real), app/tecnologia R$300, marketing R$500, ferramentas R$250, pessoas R$800, imprevistos R$100.
- Sem patrocínio pago (o Parceiro Fundador é sem custo) e sem aporte lançado.
- **Resultado:** o saldo fica negativo já em nov/2026. Para cobrir 12 meses e manter 2 meses de reserva, é preciso aportar ~R$28,5 mil ao longo do período (~R$2,4 mil/mês em média).

## O que nunca fazer

- **Nunca misturar** conta PF e PJ, nem pagar conta pessoal pela PJ. Retirada para você é lançada como retirada, nunca escondida em outra categoria.
- **Nunca lançar aporte como receita.** Isso infla o faturamento e conta errado para o limite do MEI.
- **Nunca projetar entrada sem contrato.** Patrocínio só entra no fluxo depois de assinado e com valor e data. Antes disso, fica num cenário à parte.
- **Nunca apagar lançamento.** Se errou, faça um lançamento de estorno com a descrição do motivo.
- **Nunca inventar número.** Valor não informado entra como estimativa em amarelo e marcada como tal, e é cobrado no próximo fechamento.
- **Nunca colocar na planilha** senha, token, número completo de cartão nem dados bancários de terceiros.
- **Nunca dar parecer tributário ou contábil definitivo** (enquadramento, desenquadramento, nota fiscal, contratação). Explique o básico e mande confirmar com um contador.
- **Nunca editar fórmulas** das abas Fluxo e Resumo para "fazer bater". Se não bate, o erro está nos lançamentos ou nas premissas.
