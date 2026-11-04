# Changelog

Todas as mudanças relevantes deste pacote. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [0.2.0]

### Adicionado

- Modo app com o Engramind 0.13.0: o painel do canal mostra **Editar** nos canais que o próprio app criou
  (`EngramindChannel.created_by`), e o proxy em modo `app` repassa `PATCH channels/:channel`
  (`update_channel`). Excluir de vez continua só do gestor. `canEditChannel` exportado.

### Alterado

- Mensagem de `CHANNEL_SHARED` cobre editar e arquivar.
- `ConsumerSettings.consolidation` e `search` documentados como enviados pelo Engramind 0.13.0+ (a lib
  mantém os padrões para versões anteriores).
- `settings.updated` no modo app relê `consumer-settings` (coberto por teste).

## [0.1.1]

### Alterado

- Publicação pelo GitHub Actions com **trusted publishing** (OIDC, sem token nem secret) e attestation de
  provenance no npm. Sem mudança de código em relação à `0.1.0`.

## [0.1.0]

### Adicionado

- `@engramind/client/server`: cliente tipado da API (Idempotency-Key, `If-None-Match`, erros pt-BR, 5xx mascarado pelo Cloudflare), proxy dos componentes nos modos `app` e `manager`, webhook com HMAC e descarte de repetidos, barramento + SSE (com interface `Broadcaster`), contexto com cache por `version` e configuração de MCP.
- `@engramind/client/ai`: ferramentas `search_memories`, `get_memory` e `create_memory` para o Vercel AI SDK.
- `@engramind/client/react`: rede (Agentes x canais, Universo do canal e Universo do agente; Apps x canais no modo gestor), consumo ao vivo pelo `memory.consumed` (um pulso por `consumption`), configuração do app (Agentes e assinaturas, Canais, Tokens de agente e Webhook), textos pt-BR sobrescrevíveis e tema só por tokens.
