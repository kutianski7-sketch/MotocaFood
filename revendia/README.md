# RevendIA — a revenda de cosméticos no piloto automático

Plataforma (SaaS) vendida para revendedoras de **O Boticário, Natura, Avon, Eudora** e outras marcas.
Agentes de IA (Claude) cuidam do comercial, marketing, operações, financeiro e administrativo pelo celular.
A revendedora só faz três coisas manualmente: **pagar boletos, mexer na conta bancária/chave Pix e entregar a sacolinha ao motoboy.**

## Rodar localmente

```bash
cd revendia
npm install
cp .env.example .env      # opcional: sem chaves, tudo roda em modo demonstração
npm start                 # http://localhost:3000
npm test                  # teste de ponta a ponta do fluxo pedido → entrega
```

- Landing page com o vídeo: `http://localhost:3000/`
- Assinatura (PIX/cartão): `http://localhost:3000/assinar`
- App da revendedora (PWA, instalável no celular): `http://localhost:3000/app/` → "Ver demonstração"

Requer Node 22.13+ (usa o SQLite embutido do Node, sem dependências nativas).
Com `DEMO=1` (padrão) é criada a conta de demonstração "Juliana" com 6 meses de histórico, e as integrações
sem credenciais são simuladas (marca, motoboy, Instagram, pagamentos). Em produção use `DEMO=0`.

## Jornada da revendedora

1. **Compra** na landing page → `/assinar` com nome + WhatsApp, paga com **PIX** (QR/copia e cola) ou **cartão** (Mercado Pago, até 12x).
2. **Onboarding**: entra no app só com o WhatsApp + **código de 6 dígitos** enviado no WhatsApp (modelo de autenticação da Meta).
3. Toca em **"Deixa com a IA"**: a plataforma conecta o que pode sozinha e pede só o indispensável
   (código/senha da marca, autorizar Instagram, confirmar o WhatsApp Business na janela da Meta, endereço de coleta, chave Pix).
4. A partir daí roda sozinha:

| Etapa | Quem faz |
|---|---|
| Catálogo do ciclo puxado da conta da marca (ou manual/CSV) | IA |
| Divulgação: posts no Instagram, campanhas e combos na lista de transmissão | IA |
| Pedido chega no WhatsApp → IA entende, confere estoque, manda resumo + Pix à cliente | IA |
| Junta pedidos até o **mínimo do ciclo** (ex.: R$ 199) e repassa à marca | IA |
| **Lista diária de boletos** no WhatsApp da revendedora | IA |
| Pagar o boleto | **Revendedora** |
| Identificar o pagamento (status da marca, extrato bancário ou foto do comprovante) | IA |
| Avisar a cliente quando chega e quando será entregue | IA |
| Chamar o motoboy para retirar na casa da revendedora | IA |
| Entregar a sacolinha ao motoboy | **Revendedora** |
| Cobrança da cliente, conciliação, fluxo de caixa, DRE, relatório mensal | IA |

## Agentes por área

| Área | O que o agente faz | Código |
|---|---|---|
| **Comercial** | triagem de cada mensagem (pedido/lead/suporte/pagamento), pontuação de leads (quente/morno/frio), follow-up com **cadências**, **propostas comerciais** (kits dentro do orçamento), **análise de conversas e ligações** (objeções, oportunidades, próxima mensagem) | `src/ai/triagem.js`, `src/servicos/comercial.js` |
| **Marketing** | calendário e publicação automática no Instagram, **roteiros de Reels**, **anúncios** (textos, público, orçamento), stories, carrosséis, campanhas e combos por data comemorativa, medição de resultado das campanhas | `src/servicos/marketing.js` |
| **Operações** | pedido → lote → marca → motoboy → entrega, **onboarding de clientes**, **monitoramento de CS** (saúde da carteira, NPS, recompra), **suporte** com resposta sugerida, **criticidade P1–P4 com SLA** (escala sozinha) | `src/servicos/pedidos.js`, `src/servicos/operacoes.js` |
| **Financeiro/Adm.** | **cobrança** das clientes (Pix + lembretes D+2/D+5/D+10), **conciliação bancária** (OFX/CSV), **fluxo de caixa** projetado, **DRE**, relatório mensal com análise | `src/servicos/financeiro.js` |
| **Suporte por voz** | assistente "Bia": a revendedora fala, a IA executa (resumo do dia, criar pedido, posts, campanhas, propostas, financeiro) e responde em voz alta | `src/ai/assistente.js`, `public/app/app.js` |

As rotinas automáticas ficam em `src/orquestrador.js` (lista diária, cadências, cobranças, publicação, pós-venda,
campanha semanal, relatório no dia 1º, monitoramento de criticidade).

### Segurança do dinheiro
- A IA **não tem nenhuma ferramenta** para pagar, transferir ou alterar dados bancários; o assistente redireciona para o app.
- Alterar a chave Pix de recebimento exige **novo código no WhatsApp** (`exigirConfirmacao`).
- Credenciais das integrações ficam cifradas (AES-256-GCM, `APP_SECRET`).
- Webhook do WhatsApp com verificação de assinatura `X-Hub-Signature-256`; webhook do Mercado Pago sempre reconsulta o pagamento na API.

## Integrações — o que é real e o que depende de credenciais

| Integração | Implementação | Para ligar em produção |
|---|---|---|
| IA (Claude) | `@anthropic-ai/sdk`, modelo `claude-opus-5-5`, structured outputs e ferramentas. Sem chave, regras locais. | `ANTHROPIC_API_KEY` |
| WhatsApp (OTP, avisos, pedidos, campanhas) | WhatsApp Cloud API + Cadastro Incorporado (número da revendedora, com coexistência com o app WhatsApp Business) | App na Meta, número oficial, modelos aprovados: `codigo_verificacao` (autenticação) e `campanha_revendedora` (marketing) |
| Instagram (publicação automática) | API do Instagram com login do Instagram (OAuth, token de 60 dias com renovação) | `INSTAGRAM_APP_ID/SECRET` + revisão do app na Meta. Imagens precisam ser URLs públicas JPEG. |
| Assinatura PIX/cartão | Mercado Pago (Pix via `/v1/payments`, cartão via Checkout Pro) | `MERCADOPAGO_ACCESS_TOKEN` |
| Motoboy | Lalamove API v3 (cotação + pedido, assinatura HMAC) | `LALAMOVE_API_KEY/SECRET`; coordenadas (lat/lng) dos endereços — adicionar geocodificação |
| Marcas (Boticário, Natura...) | Interface única de conector (`src/integracoes/fornecedores/`) com driver **"parceiro"** (HTTP) e driver **demo** | Ver abaixo |
| Pix das clientes | BR Code (copia e cola) gerado localmente com a chave da revendedora — validado contra o exemplo oficial do Banco Central | nada |

**Sobre as marcas:** Grupo Boticário e Natura &Co **não oferecem API pública** para revendedores. Para operar de verdade é
preciso (a) firmar parceria/credenciamento com as marcas para acesso a catálogo e pedidos — o contrato HTTP esperado pelo
driver "parceiro" está em [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md) — ou (b) automatizar o portal da revendedora,
o que pode violar os termos de uso das marcas e deve passar por avaliação jurídica antes. Enquanto isso, o catálogo manual/CSV
funciona para qualquer marca e todo o restante da plataforma (WhatsApp, cobrança, motoboy, marketing, financeiro) opera normalmente.

## Estrutura

```
server.js                      servidor Express (LP, app, API, webhooks)
src/config.js, db.js, util.js  configuração, SQLite, utilidades (Pix, cripto, datas)
src/ai/                        Claude: triagem, assistente por voz, leitura de comprovantes
src/servicos/                  agentes por área (pedidos, comercial, marketing, operações, financeiro, painel)
src/integracoes/               WhatsApp, Instagram, Mercado Pago, Lalamove, marcas
src/orquestrador.js            webhooks do WhatsApp + rotinas automáticas
src/rotas/                     auth/assinatura, API do app, webhooks
public/                        landing page, assinatura, app PWA, vídeo
video/                         pipeline do vídeo explicativo da LP
test/fluxo.test.js             teste de ponta a ponta
```
