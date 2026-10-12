# Marketing no Instagram — Motoca Food

Um agente de IA (Claude Code) faz o papel de gestor de marketing: todo dia ele lê as métricas, decide
quantos Reels e Stories postar e em quais horários, cria os vídeos e imagens na sua conta do **Higgsfield**
(incluindo o **Nano Banana**), escreve as legendas e coloca tudo numa fila. Um GitHub Actions publica
a fila no Instagram na hora certa.

```
rotina diária (Claude Code + Higgsfield)                GitHub Actions (a cada 15 min)
 ├─ métricas do Instagram  ─┐                            └─ fila.py publicar ──> Instagram Graph API
 ├─ pesquisa Apify (semanal)├─> agenda.py ─> decide quantidade e horários
 ├─ cria mídia no Higgsfield┘                 └─> fila.py adicionar ──> data/fila.json (branch marketing-fila)
 └─ diário de decisões (data/diario.md)
```

| Arquivo | Para que serve |
|---|---|
| `perfil_instagram.md` | Como criar a conta, bio, destaques e os 9 primeiros posts |
| `config/estrategia.json` | Marca, público, limites de posts por dia, orçamento de créditos, hashtags, modo de publicação |
| `../.claude/agents/gestor-marketing.md` | Instruções do agente (o "cérebro" do gestor) |
| `tools/agenda.py` | Ranking dos melhores horários |
| `tools/instagram.py` | Publicação e métricas pela API oficial |
| `tools/apify_pesquisa.py` | Pesquisa do público com o Apify |
| `tools/fila.py` | Fila de publicação, com aprovação |
| `../.github/workflows/publicar-instagram.yml` | Publicador automático |

## Como o agente decide os horários

Ele começa com uma hipótese baseada na rotina de quem roda de moto ou de carro por aplicativo: picos de trabalho
no almoço (11h–14h) e no jantar (18h–22h), celular na mão nas brechas.

- **Reels:** 9h30, 15h30 e 22h40.
- **Stories:** 8h, 10h30, 14h30, 16h30, 17h30, 22h e 23h15.
- Domingo e segunda pesam mais; sexta e sábado, menos.

A cada ciclo, `agenda.py` mistura essa hipótese com o engajamento por hora dos posts do nicho em SP (Apify) e,
principalmente, com o alcance real dos seus posts. Quanto mais posts medidos, mais peso para os seus dados.
Cerca de 25% das vezes ele testa um horário fora do topo, para descobrir horários melhores.
A quantidade de posts por dia fica dentro dos limites de `config/estrategia.json` (Reels de 1 a 3, Stories de 3 a 10)
e do orçamento diário de créditos do Higgsfield. Você muda esses números quando quiser.

## Sobre o Apify e a divulgação

O Apify é usado para **pesquisa**: o ator gratuito `apify/instagram-hashtag-scraper` coleta posts públicos com
`#motoca`, `#motoboy`, `#motoristadeaplicativo` e afins, filtra os de São Paulo feitos por entregadores e motoristas
de app e mostra:

- os horários em que esse público mais engaja;
- as hashtags em alta;
- os perfis com mais engajamento, para você convidar para collabs.

**O agente não manda DM, não comenta e não segue pessoas automaticamente.** Isso é spam pelos Termos do Instagram:
contas novas que fazem isso são bloqueadas ou banidas em poucos dias, e mensagem em massa para quem não pediu
também esbarra na LGPD. Para colocar seus posts na frente desse público:

1. **Hashtags e localização** que esse público segue (o agente usa as que estão em alta).
2. **Collabs**: convide os perfis da lista para posts em colaboração. O post aparece para os seguidores dos dois perfis.
3. **Anúncios pagos** (Impulsionar ou Gerenciador de Anúncios da Meta): público na cidade de São Paulo + interesses
   como iFood, Uber, motocicleta e entregas. É a forma oficial de "mostrar para quem posta #motoca". Dá para começar com R$ 10 a R$ 20 por dia.
4. **Grupos e comunidades** de motoboys, onde você mesmo compartilha.

## Configuração (uma vez)

### 1. Instagram
Siga `perfil_instagram.md`. A conta precisa ser **profissional**.

### 2. Token da API do Instagram
1. Em <https://developers.facebook.com>, entre com o login do Instagram/Facebook e crie um app do tipo **Empresa**.
2. Adicione o produto **Instagram > API com login do Instagram**.
3. Em *Gerar tokens de acesso*, conecte a conta `@motocafood` e gere o token com as permissões
   `instagram_business_basic`, `instagram_business_content_publish` e `instagram_business_manage_insights`.
4. Anote o **token** e o **ID da conta do Instagram** que aparece ao lado.

Com o app em modo de desenvolvimento, ele funciona para a sua própria conta, sem passar por revisão da Meta.
O token de longa duração vale 60 dias e precisa ser renovado.

### 3. Apify
Crie a conta gratuita em <https://apify.com> e copie o token em *Settings > API & Integrations*.

### 4. Segredos
- **GitHub** (Settings > Secrets and variables > Actions do repositório): `IG_ACCESS_TOKEN` e `IG_USER_ID`.
- **Ambiente do Claude Code na nuvem** (variáveis de ambiente do ambiente): `IG_ACCESS_TOKEN`, `IG_USER_ID` e `APIFY_TOKEN`.

### 5. Ligar a rotina diária
Depois de configurar os segredos, peça ao Claude: *"crie a rotina diária do gestor de marketing às 7h"*.
Ele cria uma Routine que todo dia abre uma sessão com o conector do Higgsfield e roda o agente `gestor-marketing`.

## Aprovar e publicar

O padrão é `"modo_publicacao": "aprovacao"`: o agente cria e agenda, e você aprova antes de ir ao ar.

```bash
python marketing/tools/fila.py listar aguardando_aprovacao
python marketing/tools/fila.py aprovar <id>      # ou: aprovar todos
python marketing/tools/fila.py cancelar <id>
```

Quando estiver satisfeito com a qualidade, troque para `"automatico"` em `config/estrategia.json`.

## Testes manuais

```bash
cd marketing/tools
python agenda.py 3                       # horários sugeridos para 3 dias (funciona sem nenhum token)
python instagram.py conta                # confere o token
python apify_pesquisa.py 20              # pesquisa pequena para testar o Apify
```

## Limites que valem saber

- A API publica Reels, Stories e posts de feed, mas **não** adiciona stickers de enquete ou link nos Stories nem
  música da biblioteca do Instagram. O agente marca esses itens para você completar no app.
- Limite da Meta de publicações pela API a cada 24 horas por conta, muito acima do que o agente usa.
- Gerações pelo MCP do Higgsfield sempre consomem créditos, mesmo em planos com gerações ilimitadas no site.
