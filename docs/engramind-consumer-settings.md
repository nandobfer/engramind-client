# Tarefa para o Engramind: o que o modo app da lib precisa

Este documento descreve a tarefa a criar no repositório `nandobfer/engramind` para que o modo app de
`@engramind/client` (token `kind: app`) tenha os mesmos valores que o gestor lê com o token admin. Até
a tarefa sair, a lib usa os padrões indicados em cada item e continua funcionando.

## Contexto

No modo app, a lib só tem o token do app. Pelo contrato atual (`docs/openapi.json` e o guia
`tokens-e-escopos`), três leituras de que a interface precisa são só do admin:

| O que a lib precisa | Onde está hoje | Quem lê hoje |
|---|---|---|
| Prazo de desuso `consolidation.stale_after_days` (brilho das memórias na rede) | `get_settings` | só admin |
| Pesos da busca `search.vector_weight`, `search.text_weight`, `search.rrf_k` (destaque dos resultados na rede) | `get_settings` | só admin |
| Estado do webhook do próprio app (`webhook.url`, `webhook.secret.configured/updated_at`) | `get_app` | só admin |

Também ficou de fora a edição de canais pelo app: `update_channel` é só do admin, embora o token de app
crie (pela assinatura exata), arquive e restaure os canais que criou.

## Pedido

### 1. `get_consumer_settings` com o prazo de desuso e os pesos da busca (obrigatório)

Acrescentar à resposta de `GET /v1/consumer-settings` (e à ferramenta MCP e à CLI equivalentes) dois
grupos só de leitura, sem segredo:

```json
{
  "consolidation": { "stale_after_days": 90 },
  "search": { "vector_weight": 1, "text_weight": 1, "rrf_k": 60 }
}
```

- Os valores são os globais efetivos (`consolidation.stale_after_days` não aceita sobreposição por canal).
- Qualquer token com `read` lê, como o resto de `get_consumer_settings`.
- `settings.updated` com essas chaves já é emitido; o consumidor relê ao receber.
- Atualizar `ConsumerSettings` no OpenAPI, o guia `integracao-consumidor` ("Limites para a interface") e
  o CHANGELOG.

**Uso na lib:** `useEngramindNetwork` lê `consumer.consolidation.stale_after_days` e
`consumer.search.*` no modo app (`resolveStaleAfterDays` e `consumerSearchFusion`). Sem os campos: 90
dias e 1/1/60. O app ainda pode fixar o prazo com `staleAfterDays` no `EngramindProvider`.

### 2. Estado do webhook do próprio app para o token de app (obrigatório)

Uma das duas opções:

- **(a)** liberar `get_app` para o token de app **só no próprio app** (`403 FOREIGN_APP` em outro), com a
  mesma resposta de hoje (o segredo nunca volta, só `configured` e `updated_at`); ou
- **(b)** incluir `webhook: { url, secret: { configured, updated_at } } | null` no `whoami` quando o token
  é de app.

**Uso na lib:** o `WebhookCard` lê `GET apps/<app>`. Hoje, com `403`, mostra "Estado atual indisponível
para este token" e mostra só o que foi gravado na própria visita. Salvar uma URL sem segredo conhecido
gera um segredo (a URL exige segredo). Com a opção (b), a lib passa a ler o `whoami`.

### 3. Editar os canais que o app criou (desejável)

Liberar `update_channel` (nome, descrição e prioridade) para o token de app **só nos canais que ele
criou** (o mesmo critério de `archive_channel`/`restore_channel`), com `409 CHANNEL_SHARED` quando outro
app assina o canal.

**Uso na lib:** o painel do canal esconde **Editar** no modo app enquanto o contrato não liberar. Com a
liberação, a lib passa a mostrar **Editar** nos canais do app. Isso exige mudança na lib e uma versão
nova.

## Critérios de aceite

1. Com um token de app, `GET /v1/consumer-settings` traz `consolidation.stale_after_days` e
   `search.vector_weight`/`text_weight`/`rrf_k` com os valores globais efetivos.
2. Com um token de app, o estado do webhook do próprio app pode ser lido pela opção escolhida no item 2.
   Para outro app, a leitura recebe `403 FOREIGN_APP`. O segredo nunca aparece.
3. (Item 3) Com um token de app, `PATCH /v1/channels/{canal}` funciona nos canais criados pelo app e
   devolve `409 CHANNEL_SHARED` nos compartilhados.
4. OpenAPI, guias (`integracao-consumidor` e `tokens-e-escopos`), MCP, CLI e CHANGELOG atualizados, com
   testes.
