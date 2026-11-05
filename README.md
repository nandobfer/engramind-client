# @engramind/client

Cliente do [Engramind](https://github.com/nandobfer/engramind) para **apps consumidores**: os apps cujos agentes usam memórias. O pacote tem três partes:

- **Servidor** (`@engramind/client/server`): cliente da API, proxy dos componentes, webhook + SSE, contexto com cache e configuração de MCP.
- **Ferramentas de IA** (`@engramind/client/ai`): buscar, ler e criar memória no Vercel AI SDK.
- **React** (`@engramind/client/react`): componentes de configuração do app e de visualização das redes de memória. As cores vêm do tema do seu app.

A lib é só para consumidores. A gestão da rede (outros apps, tokens admin ou de app, configurações globais, provedores, operação) fica com o gestor. A versão atual está no [`package.json`](./package.json) e as mudanças no [CHANGELOG](./CHANGELOG.md).

## Requisitos

- Engramind com o evento de webhook `memory.consumed` (consumo ao vivo; versão indicada no CHANGELOG do Engramind).
- React 19, Tailwind CSS 4 e os tokens de tema do shadcn/ui.
- Peer dependencies: `react`, `react-dom`, `@xyflow/react`, `framer-motion`, `@tanstack/react-query`, `lucide-react`, `zod`. `ai` só é necessário para `@engramind/client/ai`.
- Um **token de app** (`kind: app`) emitido pelo gestor da rede. Ele fica só no servidor.

## Instalação

```bash
pnpm add @engramind/client @xyflow/react framer-motion @tanstack/react-query lucide-react zod
```

Os componentes usam classes do Tailwind. Inclua o pacote na varredura do Tailwind e importe as folhas do React Flow e do `react-day-picker` (o pacote não importa CSS, para funcionar em qualquer bundler e nos testes):

```css
@import "tailwindcss";
@import "@xyflow/react/dist/style.css";
@import "react-day-picker/style.css";
@source "../node_modules/@engramind/client/dist";
```

Ajuste o caminho do `@source` a partir do arquivo CSS.

### Tokens de tema usados

A lib não tem nenhuma cor fixa (um teste garante isso). Ela usa as variáveis do Tailwind 4 e do shadcn/ui:

- `--color-primary`, `--color-primary-foreground`, `--color-background`, `--color-foreground`, `--color-card`, `--color-muted-foreground`, `--color-border`, `--color-input`, `--color-ring`, `--color-accent`, `--color-destructive` e `--radius`. São as classes `bg-primary`, `text-foreground` e as demais.
- `--chart-1` a `--chart-6`, para a cor de cada canal. Sem `--chart-6`, a lib usa uma variação do `--chart-3`.
- Opcionais: `--color-success` (partícula de memória criada e selos de sucesso) e `--color-warning` (selos de aviso). Sem eles, a lib usa `--color-primary` e `--color-accent`.

Com uma primária azul, a rede, as partículas, os pulsos e as telas ficam azuis.

## Servidor (exemplo com Next.js App Router)

Todas as rotas ficam **atrás do login do app**: a lib não verifica usuário. O token do app fica só no servidor (variável de ambiente ou cofre do app) e nunca vai ao navegador nem às respostas do proxy.

```ts
// lib/engramind.ts (só servidor)
import { createContextCache, createEngramindClient, createEventBus } from "@engramind/client/server"

export const engramind = createEngramindClient({ baseUrl: process.env.ENGRAMIND_URL!, token: process.env.ENGRAMIND_APP_TOKEN!, userAgent: "meu-app" })
export const engramindBus = createEventBus()
export const engramindContext = createContextCache({
    // O contexto é o do agente: use o token de cada agente.
    client: (agent) => createEngramindClient({ baseUrl: process.env.ENGRAMIND_URL!, token: agentToken(agent) }),
})
```

```ts
// app/api/engramind/[...path]/route.ts: proxy dos componentes
import { createEngramindProxy } from "@engramind/client/server"
import { engramind } from "@/lib/engramind"
import { requireUser } from "@/lib/auth"

const proxy = createEngramindProxy({
    client: engramind,
    mode: "app",
    basePath: "/api/engramind",
    onMutation: (mutation) => audit(mutation), // opcional: auditoria do app
    onTokenIssued: (secret, token) => saveAgentToken(token.agent, secret), // opcional: guardar o token emitido
})
const handler = async (request: Request) => (await requireUser(request)) ?? proxy(request)
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
```

```ts
// app/api/engramind/events/route.ts: SSE dos componentes
import { createSseHandler } from "@engramind/client/server"
import { engramindBus } from "@/lib/engramind"

export const dynamic = "force-dynamic"
const sse = createSseHandler({ bus: engramindBus })
export async function GET(request: Request) {
    return (await requireUser(request)) ?? sse(request)
}
```

```ts
// app/api/engramind/webhook/route.ts: webhook do Engramind (público, autenticado pela assinatura)
import { createWebhookHandler } from "@engramind/client/server"
import { engramindBus, engramindContext } from "@/lib/engramind"

export const POST = createWebhookHandler({ secret: process.env.ENGRAMIND_WEBHOOK_SECRET!, bus: engramindBus, context: engramindContext })
```

As pastas `events` e `webhook` têm prioridade sobre o catch-all `[...path]`.

### O que cada parte faz

- **Proxy** (`createEngramindProxy`): repassa só as rotas permitidas no modo.
  - O caminho é o do REST do Engramind sem o `/v1`.
  - No modo `app`, rotas de gestor (como `apps`, `settings` e criar canal) recebem `404` sem chamar o Engramind, e `issue_token` só emite `kind: agent`.
  - A resposta é `{ success: true, data }` ou `{ success: false, error, code, details }`. Os códigos levam o prefixo `ENGRAMIND_` (ex.: `ENGRAMIND_CHANNEL_SHARED`), a mensagem é pt-BR e o `Retry-After` do `429` é repassado.
- **Webhook** (`createWebhookHandler`): valida `Engramind-Signature`, que é o HMAC-SHA256 de `t + "." + corpo`.
  - A janela é de 300 s e a comparação é em tempo constante. Sem assinatura válida, a resposta é `401` sem corpo.
  - Um `id` repetido é descartado (padrão em memória por 24 h; troque com `dedupe`).
  - Marca o contexto do canal como sujo, exceto em `memory.consumed`, e republica o evento no SSE só com ids, slugs e tipos.
- **SSE** (`createSseHandler`): manda `event: engramind` e um sinal de vida a cada 25 s. Quando a conexão cai, o navegador reconecta com espera crescente e relê as telas.
- **Contexto** (`createContextCache`): faz o `get_context` por agente com `If-None-Match` (o `304` reaproveita o bloco).
  - Se o Engramind cair, devolve o último bloco (`stale: true`).
  - `revalidate: "on-dirty"` só chama o Engramind quando um evento sujou o canal.
  - Coloque o bloco na parte estável do prompt.

### Limite: um processo

O barramento padrão vive no processo. Com várias instâncias, só os navegadores ligados à instância que recebeu o webhook são avisados. Nesse caso, passe um `Broadcaster` (Redis pub/sub, Postgres `NOTIFY`, Pusher…):

```ts
const engramindBus = createEventBus({ broadcaster: { publish: (event) => redis.publish("engramind", JSON.stringify(event)), subscribe: (listener) => subscribeRedis("engramind", listener) } })
```

### Registrar o webhook

Use a aba **Webhook** da configuração (`EngramindAppSettings`) ou `engramind.apps.updateWebhook(app, { url, secret })`. O segredo (de 32 a 256 caracteres) aparece uma única vez: grave-o no servidor do app (`ENGRAMIND_WEBHOOK_SECRET`). Sem webhook, ou com `webhooks.enabled = false` no Engramind, não há tempo real nem pulso de consumo, e as telas atualizam pelas próprias ações e ao reconsultar.

## React

```tsx
"use client"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { createHttpDataSource, EngramindAppSettings, EngramindNetwork, EngramindProvider } from "@engramind/client/react"

const dataSource = createHttpDataSource({ basePath: "/api/engramind" })
const navigation = { useRouter, usePathname, useSearchParams }

export function MemoriasPage() {
    return (
        <EngramindProvider
            dataSource={dataSource}
            events="/api/engramind/events"
            app="meu-app"
            appName="Meu app"
            navigation={navigation}
            renderLink={({ href, children, ...props }) => <Link href={href} {...props}>{children}</Link>}
            notify={(kind, message) => toast[kind](message)}
            hrefs={{ network: "/memorias", channel: (slug) => `/memorias/canais/${encodeURIComponent(slug)}` }}
            onConfigure={() => router.push("/memorias/configuracao")}
        >
            <EngramindNetwork />
        </EngramindProvider>
    )
}
```

Monte dentro do `QueryClientProvider` do app (TanStack Query). Use um `EngramindProvider` por página: dois providers com fontes de dados diferentes na mesma tela usam a fonte do último montado.

### Componentes

| Componente | O que mostra |
|---|---|
| `EngramindNetwork` | A rede. No modo app, a visão inicial é **Agentes x canais** do app (distribuições Órbita e Radial), com o **Universo do canal** e o **Universo do agente** (`?universo=`). Traz estatísticas, card da memória, filtros, busca, painel do canal, lista "Sem memórias (N)", Centralizar e layout de celular. |
| `EngramindAppSettings` | A configuração do app em quatro abas: **Agentes** (criar, editar, desativar e reativar, excluir e as assinaturas exata/prefixo com o modo inject, search ou manage), **Canais** (criar pela assinatura exata, arquivar e restaurar os próprios), **Tokens de agente** (o segredo aparece uma única vez, com Copiar; editar, rotacionar e revogar) e **Webhook**. |
| `ChannelDetail` | Página do canal: assinantes e o conteúdo extra do app (`slots.channelDetail`). |
| `AgentUniverse` | O **universo de um agente** fora da rede (`agent="app/agente"`): o agente no centro e as memórias de todos os canais que ele assina, com os mesmos dados, ações, cores e tempo real da rede. **"Nova memória"** escolhe o canal entre os assinados e não arquivados (`defaultCreateChannel` é o inicial; `allowCreate={false}` esconde). Agente inexistente mostra um estado vazio. A rede usa o mesmo componente (`AgentUniverseView`) no `?universo=agente:…`. |
| `MemoryUniverse` | O universo por props (memórias que o app já tem), com consumo ao vivo. Com o cursor sobre a partícula, o nome cortado dá lugar ao **nome completo destacado**, numa camada fora do zoom (sempre inteiro no quadro, sem cobrir nem ser coberto pelas vizinhas). |

Memórias: tudo o que o token permite (criar, editar, ativar e desativar, fixar, mover, excluir e importar), com confirmação nas ações críticas. Quando o Engramind recusa, aparece uma mensagem em pt-BR:

- `403 FOREIGN_APP` e `403 CHANNEL_NOT_SUBSCRIBED` mostram "Sem acesso".
- `401` mostra o estado de reconfigurar.
- Fora do ar, proxy mascarado e `429` mostram "Tentar novamente".

### Consumo ao vivo

O webhook `memory.consumed` chega um por canal. A lib junta os eventos da mesma leitura pelo `consumption` e anima **uma vez**: a partícula vai do agente aos canais e volta dos que entregaram, com brilho cheio até a releitura. Um consumo é ignorado quando:

- não tem agente (leitura por token de app ou admin);
- só traz memórias que não estão carregadas na tela.

O agente de outro app que lê um canal visível pulsa só o canal. O consumo não invalida o contexto.

O brilho das memórias usa `last_retrieved_at` e o prazo `consolidation.stale_after_days`. No modo app, o prazo e os pesos da busca vêm de `get_consumer_settings` (Engramind 0.13.0+); o `staleAfterDays` do provider, quando informado, vence. Com Engramind anterior, a lib usa 90 dias e os pesos 1/1/60.

### Textos

Os textos estão em pt-BR. Para sobrescrever qualquer chave de `DEFAULT_MESSAGES`, passe `messages`. Chave ausente usa o padrão.

```tsx
<EngramindProvider messages={{ "network.noAgents.title": "Nenhum robô ativo" }} …>
```

### Modo gestor

`mode="manager"` é para o gestor da rede, como o Opex, com o proxy em modo `manager` e o token admin. Ele libera a visão **Apps x canais**, os apps, criar, editar e excluir canais e as configurações globais da rede. O modo gestor não aparece no modo app.

## Ferramentas de IA e MCP

```ts
import { engramindTools } from "@engramind/client/ai"
import { createEngramindClient, engramindMcpConfig } from "@engramind/client/server"

const agentClient = createEngramindClient({ baseUrl, token: agentToken })
const tools = engramindTools({ client: agentClient, write: true }) // search_memories, get_memory, create_memory

const mcp = engramindMcpConfig({ baseUrl, agentToken, channels: ["meu-app/global"] }) // POST /mcp + Engramind-Channels
```

Use o token **do agente**. Assim, o consumo aparece na rede como dele.

## Desenvolvimento e publicação

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

A GitHub Action roda TypeScript, Vitest e build em todo PR e push. A tag `vX.Y.Z` (igual à versão do `package.json`) publica no npm público por **trusted publishing**: o pacote aponta para este repositório e este arquivo de workflow em npmjs.com, e o GitHub assina com OIDC (sem token nem secret).

## Versão mínima do Engramind no modo app

Com o Engramind 0.13.0 ou superior, o token de app lê o prazo de desuso e os pesos da busca
(`get_consumer_settings`), o estado do webhook do próprio app (`get_app`) e edita os canais que o app
criou (`update_channel`; o painel do canal mostra **Editar** só quando `created_by` é o app). Com versões
anteriores, a lib usa os padrões e o Engramind recusa a edição. O pedido original está em
[`docs/engramind-consumer-settings.md`](./docs/engramind-consumer-settings.md).
