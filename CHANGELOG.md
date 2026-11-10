# Changelog

Todas as mudanças relevantes deste pacote. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa [SemVer](https://semver.org/lang/pt-BR/).

## [0.11.0]

### Adicionado

- **Cena de carregamento das redes (OPE-157):** o `NetworkSkeleton` troca as barras cinzas por uma prévia do
  universo em movimento — nó do agente no centro com halo respirando, partículas convergindo de uma coroa
  (posições e atrasos determinísticos, mesma duração/easing do `PathTraveler`), dois pulsos saindo do centro e os
  anéis do universo bem tênues nos raios do `universeLayout`. Só `transform`/`opacity` com Framer Motion e só
  tokens do tema. Mantém a altura (`fill`), os `data-testid` e o card de estatísticas recolhido.
- `NetworkSkeleton` aceita `agent` (`app/agente`): o centro mostra o ícone do agente (`agentIcon`). O
  `AgentUniverse` repassa o agente ao próprio skeleton.
- Acessibilidade: `role="status"`, `aria-busy` e o texto `network.loading` ("Carregando a rede de memórias…")
  só para o leitor de tela; com `prefers-reduced-motion`, a cena fica parada (sem partículas nem pulsos).
- Entrada suave: o canvas que substitui o skeleton entra com fade de 250 ms (`NetworkRevealContext`); trocar de
  universo depois não repete o fade.
- `UNIVERSE_CENTER_SIZE_CLASS`, compartilhada pelo nó central do universo e pela cena.

### Corrigido

- Um refetch com dados em tela não volta mais ao skeleton quando a primeira página de memórias aponta para
  outra (`hasNextPage` só segura o carregamento na primeira carga).

## [0.10.0]

### Adicionado

- **Âncora "bloco" do `fill="viewport"`:** `NETWORK_FILL_BLOCK_PROPS` (`data-network-fill-root="block"`) faz o
  elemento inteiro (ex.: um card com cabeçalho e padding em volta da rede) caber na altura visível da área que
  rola; o canvas fica com o que sobra dentro dele (mínimo `NETWORK_FILL_MIN_HEIGHT`). A âncora de topo
  (`NETWORK_FILL_ROOT_PROPS`) continua igual. `fillOutside` na raiz `react`.
- `AgentUniverse`/`AgentUniverseView` aceitam `fill="viewport"` (`NetworkFillMode`), no canvas e no skeleton.

## [0.9.0]

### Adicionado

- **Rede com a altura da tela:** `fill="viewport"` em `EngramindNetwork`, `MemoryUniverse`, `NetworkCanvas` e
  `NetworkSkeleton` (tipo `NetworkFillMode`). O bloco da rede (da âncora `[data-network-fill-root]` até o fim do
  canvas: trilha, filtros e canvas) ocupa a altura visível da área que rola, menos o padding dela, sem contar o
  conteúdo abaixo, com o mínimo `NETWORK_FILL_MIN_HEIGHT`. Recalcula com a janela, a área e a âncora; a visão
  reenquadra só na primeira medida. A raiz do `EngramindNetwork` é a âncora; `NETWORK_FILL_ROOT_PROPS` marca a
  de um skeleton fora da lib. `fill` (`true`) continua preenchendo a sobra, como na 0.7.0.
- `viewportFillHeight` (pura), `visibleScrollHeight`, `layoutTop`, `NETWORK_FILL_ROOT_ATTRIBUTE` e
  `NETWORK_FILL_ROOT_PROPS` na raiz `react`. O `data-fill` mostra o modo (`"true"` ou `"viewport"`).

## [0.8.0]

### Adicionado

- **Prefixo no rótulo do canal:** `ChannelLabel.prefix` (opcional) substitui o trecho antes da ponta do slug
  em `channelNameParts` e `channelDisplayName`, e por eles em `ChannelName`, `ChannelDisplayName`, legendas,
  chips, trilha e filtro "Canal". Serve para slugs com o trecho ilegível no meio (ex.:
  `app/campanhas/<id>/jogadores` → `app/campanhas/Águas de Prata · Jogadores`). A dica
  (`channelDisplayHint`) continua com o slug inteiro. Sem `prefix`, nada muda.

## [0.7.0]

### Adicionado

- **Rede que preenche a altura disponível:** prop `fill` em `EngramindNetwork`, `MemoryUniverse`,
  `AgentUniverse`/`AgentUniverseView` e `NetworkSkeleton`. O canvas cresce até o fim da área que rola (sem
  faixa vazia embaixo da página), encolhe quando o conteúdo transborda e nunca fica abaixo de
  `NETWORK_FILL_MIN_HEIGHT` (320 px). Mede antes da pintura e de novo quando a área ou o conteúdo mudam de
  tamanho, e reenquadra a visão quando chega a primeira medida. No `EngramindNetwork`, o modo vale para o
  skeleton e para todas as visões (`NetworkFillContext`). Sem `fill`, a altura continua a das classes.
- `useFillAvailableHeight`, `nextFillHeight` (pura), `findScrollParent` e `scrollContentHeight` na raiz `react`.
- `includeChannel` no `AgentUniverse`/`AgentUniverseView`: restringe os canais do universo (memórias, cores e
  "Nova memória"), ex.: só os que valem num escopo do app.
- `className` no `EngramindNetwork` (na raiz) e o tipo `AgentUniverseProps`.

## [0.6.0]

### Alterado

- **Card de estatísticas recolhível:** em qualquer largura (antes só no celular) o card do canto da rede
  começa recolhido num botão com o título e o resumo (no celular, só o resumo) e abre por cima do quadro, com
  um botão para recolher e o foco acompanhando a troca. Vale na visão inicial, na visão por apps e nos
  universos do canal e do agente. Atualizações ao vivo, filtros e mudanças de layout não o recolhem; trocar de
  visão ou de universo o monta de novo, recolhido. O skeleton mostra o botão recolhido e a área da rede
  inteira.

## [0.5.0]

### Adicionado

- **Layout do universo configurável:** `universeLayout` no `EngramindProvider` e `layoutConfig` no
  `MemoryUniverse`, com disposição (anéis ou espiral), ordem e critério (criação, atualização, último uso ou
  uso), agrupamento por canal, distribuição dos anéis, raio, distâncias, giro, desvio de ângulo e de raio com
  semente, distância mínima e tamanho das partículas.
- Na raiz do pacote: `universeLayoutSchema` (Zod estrito, mensagens em pt-BR), `DEFAULT_UNIVERSE_LAYOUT`,
  `UNIVERSE_NUMBER_FIELDS`, `UNIVERSE_LAYOUT_PRESETS`, `parseUniverseLayout`, `parseUniverseLayoutJson`,
  `formatUniverseLayoutJson` e `resolveUniverseLayout` (exportar/importar a configuração em JSON).
- `layoutUniverse`, `universeRingCounts`, `universeRingCapacity`, `particleSize` e `buildParticles` aceitam a
  configuração.

### Alterado

- **O padrão volta ao desenho original:** anéis concêntricos a partir do raio 150 (+58 por anel, ~46 px entre
  vizinhas), as mais novas por dentro e sem desvio (as posições são as da 0.3.0). O espaçamento maior, o
  desvio e as mais novas por fora da 0.4.0 viram o preset "Anéis soltos". O universo se reenquadra quando a
  configuração muda.
- Mantidas da 0.4.0: as **cores dos canais** (uma matiz própria para cada canal antes de repetir; só então o tom).

## [0.4.0]

### Alterado

- **Universo da rede com mais respiro e posições variadas:** mais espaço entre as partículas e entre os
  anéis, e cada partícula é deslocada um pouco em ângulo e raio por um desvio estável derivado do `id`
  (o desenho deixa de ser um alvo de círculos). O desvio nunca tira a partícula da faixa do seu anel
  nem a aproxima de outra (`UNIVERSE_MIN_DISTANCE`).
- **Sentido do raio invertido:** a memória **mais nova** fica no anel **externo** e as **mais antigas**
  no interno; data de criação inválida conta como a mais antiga e vai para o anel interno.
- **Cores dos canais bem distintas:** cada canal ganha uma matiz própria (`--chart-2..6`) enquanto
  houver base livre (sondagem circular a partir da preferência do slug). Só com as 5 matizes ocupadas
  começa a rodada seguinte, que varia o tom (mais clara, depois mais escura). Num universo, dois canais
  que caem na mesma matiz ficam em matizes diferentes (o de slug maior muda); os demais mantêm a cor
  global. `PRIMARY_CHANNEL_COLOR` continua exclusivo do canal com mais memórias de cada universo.

## [0.3.0]

### Adicionado

- `AgentUniverse`: o universo de um agente como componente próprio (`agent="app/agente"`,
  `defaultCreateChannel`, `allowCreate`), com os dados, as ações, as cores e o tempo real da rede, e
  estado vazio para agente inexistente. A rede passa a usar o mesmo `AgentUniverseView` no universo do agente.
- **"Nova memória" no universo do agente**, com a escolha do canal entre os assinados e não arquivados
  (`MemoryEditorTarget.channels`; `onSave` do `MemoryEditorDialog` recebe `channel`).
- Funções puras `agentUniverseChannels`, `agentCreateChannels` e `clampLabelRect`.

### Alterado

- Hover da partícula da memória: o nome deixa de sumir e aparece **completo e destacado** (borda com a cor
  da partícula, fonte maior), numa camada fora da área com zoom, sempre inteiro no quadro. Sem hover, o
  nome curto cortado continua como antes; no toque e com o card aberto, não há rótulo.

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
