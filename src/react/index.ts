/**
 * `@engramind/client/react`: componentes da rede de memórias e da configuração do app, só com os tokens
 * do tema do app (Tailwind 4 + shadcn/ui). Monte dentro de `QueryClientProvider` e de `EngramindProvider`.
 */
export { EngramindProvider, type EngramindProviderProps } from "./provider"
export { createHttpDataSource, apiErrorCode, apiErrorMessage, apiErrorStatus, errorFromResponse, type EngramindDataSource, type HttpDataSourceOptions, type HttpMethod, type Params } from "./lib/api"
export { useEngramindConfig, useIsManager, useT, type ConfigureTarget, type EngramindConfig, type EngramindHrefs, type EngramindMode, type FooterContext, type RenderLinkProps } from "./lib/config"
export { DEFAULT_MESSAGES, mergeMessages, type MessageKey, type Messages, type PartialMessages } from "./lib/messages"
export { historyNavigation, type EngramindRouter, type NavigationAdapter } from "./lib/navigation"
export type { Notify, NotifyKind } from "./lib/toast"
export { subscribeLive, type LiveSubscription } from "./lib/live"

// Rede
export { EngramindNetwork } from "./engramind/components/network/EngramindNetwork"
export { MemoryUniverse, type MemoryUniverseProps, type UniverseCenter } from "./engramind/components/network/MemoryUniverse"
export { ChannelPanel, canEditChannel } from "./engramind/components/network/ChannelPanel"
export { ChannelLabelsProvider, ChannelDisplayName, ChannelName, useChannelLabels } from "./engramind/components/network/ChannelName"
export { NetworkSkeleton } from "./engramind/components/network/NetworkSkeleton"
export { NetworkFooter } from "./engramind/components/network/NetworkFooter"
export { MemoryEditorDialog, type MemoryEditorTarget } from "./engramind/components/network/MemoryEditorDialog"
export type { MemoryCardActions } from "./engramind/components/network/MemoryCard"
export { useLocalRemovals, type LocalRemovals } from "./engramind/components/network/useLocalRemovals"
export { MEMORY_CARD_WIDTH, MEMORY_CARD_HEIGHT, MEMORY_CARD_MORPH_S } from "./engramind/components/network/MemoryCardLayer"
export { ORBIT_STROKE_WIDTH } from "./engramind/components/network/edges"
export { parseUniverse, formatUniverse, UNIVERSE_PARAM, APP_PARAM } from "./engramind/components/network/useUniverseParam"
export * from "./engramind/components/network/layout-classes"
export { ChannelDetail, networkHref } from "./engramind/components/page/channels/ChannelDetail"
export { SubscribersCard } from "./engramind/components/page/channels/SubscribersCard"

// Configuração do app
export { EngramindAppSettings, AppSettingsSkeleton, type AppSettingsTab } from "./engramind/components/config/AppSettings"
export { WebhookCard, generateWebhookSecret } from "./engramind/components/config/WebhookCard"
export { ChannelsCard } from "./engramind/components/config/ChannelsCard"

// Peças compartilhadas
export { QueryBoundary, isNoAccessError } from "./engramind/components/shared/QueryBoundary"
export { Section } from "./engramind/components/shared/Section"
export { HelpBadge } from "./engramind/components/shared/Badges"
export { MemoryEditor } from "./engramind/components/memory/MemoryEditor"
export { DEFAULT_MEMORY_TEXT_LIMITS, memoryTextSchema, type MemoryTextLimits } from "./engramind/memory-text"

// Dados e tempo real
export { useEngramindQuery, useEngramindList, useEngramindMutation, useEngramindRealtime, engramindGet, engramindSend, engramindKey, areaKey, areasForEvent, needsReconnect, route } from "./engramind/hooks/useEngramind"
export { useEngramindNetwork, useOwnApp, toNetworkMemory, firstSentence, searchFusionOf, consumerSearchFusion, resolveStaleAfterDays, STALE_AFTER_DAYS_KEY } from "./engramind/hooks/useEngramindNetwork"
export { useEngramindConsumption, useLiveEffects, isConsumptionEvent, CONSUMPTION_REFRESH_DELAY_MS, CONSUMPTION_GROUP_WINDOW_MS, type Travel, type LiveEffects } from "./engramind/hooks/useEngramindConsumption"
export { useNetworkSearch, channelBatches } from "./engramind/hooks/useNetworkSearch"

// Funções puras da rede
export * from "./engramind/network/network-math"
export * from "./engramind/network/types"
export * from "./engramind/network/channel-labels"
export * from "./engramind/network/overview-layout"
export * from "./engramind/network/filters"
export * from "./engramind/network/particles"
export * from "./engramind/network/app-network"

// Tema dos canvas React Flow
export { FLOW_SURFACE_CLASS, FLOW_EDGE_PRIMARY_STROKE, FLOW_THEME_STYLE, FLOW_BACKGROUND_PROPS } from "./components/flow/flow-theme"
export { PathTraveler } from "./components/flow/path-traveler"
