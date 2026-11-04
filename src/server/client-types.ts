export interface ChannelQuery {
    include_archived?: boolean
    cursor?: string
    limit?: number
}

export interface MemoryQuery {
    channels?: string
    status?: string
    category?: string
    cursor?: string
    limit?: number
    stale?: boolean
}

export interface CategoryInput {
    key: string
    label?: string
    description?: string
    priority?: number
}
