/**
 * `@engramind/client/server`: cliente da API, proxy dos componentes, webhook + SSE, contexto com cache e
 * configuração de MCP. Só no servidor: o token do app nunca vai ao navegador.
 */
export { createEngramindClient, buildUrl, debugUrl, type EngramindClient, type EngramindClientOptions, type CallOptions, type EngramindMethod, type Query } from "./client"
export type { ChannelQuery, MemoryQuery, CategoryInput } from "./client-types"
export { createEngramindProxy, errorResponse, proxySegments, type EngramindProxyOptions, type ProxyMutation } from "./proxy"
export { PROXY_ROUTES, matchProxyRoute, type ProxyMode, type ProxyRoute, type RouteMatch } from "./routes"
export { createWebhookHandler, verifyWebhookSignature, parseSignatureHeader, signWebhook, createMemoryDedupe, WEBHOOK_TOLERANCE_SECONDS, type DedupeStore, type WebhookHandlerOptions } from "./webhook"
export { createEventBus, type Broadcaster, type EventBus, type LiveListener } from "./bus"
export { createSseHandler, formatSse, type SseOptions } from "./sse"
export { createContextCache, createMemoryContextStore, contextKey, invalidatesContext, type ContextCache, type ContextCacheOptions, type ContextEntry, type ContextResult, type ContextStore } from "./context"
export { engramindMcpConfig, MCP_READ_TOOLS, MCP_WRITE_TOOLS, type EngramindMcpConfig } from "./mcp"
export * from "../core/errors"
export * from "../core/events"
