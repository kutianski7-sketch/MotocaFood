# Contrato HTTP do conector "parceiro" (marcas)

Quando houver acesso oficial (parceria) a uma marca, configure:

```
FORNECEDOR_BOTICARIO_API_URL=https://api.parceiro.exemplo/boticario
FORNECEDOR_BOTICARIO_API_KEY=...
```

(o mesmo vale para `NATURA`, `AVON`, `EUDORA`). O driver envia os cabeçalhos `X-Api-Key`, `X-Revendedor-Codigo` e,
após autenticar, `Authorization: Bearer <token>`. Se a API da marca tiver outro formato, escreva um adaptador
com a mesma interface em `src/integracoes/fornecedores/index.js`.

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| POST | `/revendedores/autenticar` | `{ codigo, senha }` | `{ codigo, nome, token }` |
| GET | `/catalogo/ciclo-atual` | — | `{ produtos: [{ sku, nome, categoria, preco_catalogo, preco_custo, imagem }] }` |
| POST | `/pedidos` | `{ itens: [{ sku, nome, qtd, custo_unit }] }` | `{ pedidoId, boleto: { valor, vencimento, linhaDigitavel, pixCopiaECola }, previsaoChegada }` |
| GET | `/pedidos/{id}` | — | `{ status: aguardando_pagamento \| pago \| faturado \| em_transito \| entregue, previsaoChegada }` |

O orquestrador consulta `/pedidos/{id}` a cada ciclo (padrão 30 s, `INTERVALO_ROTINAS_MS`) e avança o pedido:
pagamento confirmado → avisa clientes com previsão; `entregue` → chama motoboy.

# WhatsApp — modelos que precisam ser aprovados na Meta

| Nome | Categoria | Corpo sugerido |
|---|---|---|
| `codigo_verificacao` | Autenticação | `{{1}} é o seu código de verificação.` (botão copiar código) |
| `campanha_revendedora` | Marketing | `Oi, {{1}}! {{2}}` |

Webhook: `GET/POST {BASE_URL}/api/webhooks/whatsapp` (token de verificação `WHATSAPP_VERIFY_TOKEN`).
Mercado Pago: `POST {BASE_URL}/api/webhooks/mercadopago`.
Instagram (redirect OAuth): `{BASE_URL}/api/integracoes/instagram/callback`.

# Limitações conhecidas
- Áudios de clientes no WhatsApp ainda não são transcritos (a IA pede a mensagem por escrito). O assistente da revendedora usa o reconhecimento de voz do navegador (Chrome/Android, Safari/iOS).
- Lalamove exige coordenadas; adicione um serviço de geocodificação para preencher `lat/lng` dos endereços.
- Para muitas revendedoras, troque o SQLite por Postgres e o `setInterval` do orquestrador por uma fila (ex.: BullMQ).
