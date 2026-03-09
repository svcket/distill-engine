import path from 'path'
import fs from 'fs'

const STORE_PATH = path.resolve(process.cwd(), '../execution/.tmp/sources_db.json')

export interface StoredSource {
    id: string
    title: string
    channel: string
    url: string
    published: string
    duration: string
    score: number
    status: string
    completedStages: string[]
    createdAt: string
    updatedAt: string
}

export interface StoreData {
    sources: StoredSource[]
}

function ensureDir() {
    const dir = path.dirname(STORE_PATH)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

export function loadStore(): StoreData {
    ensureDir()
    if (!fs.existsSync(STORE_PATH)) {
        return { sources: [] }
    }
    try {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8')
        return JSON.parse(raw) as StoreData
    } catch {
        return { sources: [] }
    }
}

export function saveStore(data: StoreData): void {
    ensureDir()
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function upsertSource(source: Partial<StoredSource> & { id: string }): StoredSource {
    const store = loadStore()
    const existing = store.sources.find(s => s.id === source.id)

    if (existing) {
        Object.assign(existing, source, { updatedAt: new Date().toISOString() })
        saveStore(store)
        return existing
    } else {
        const newSource: StoredSource = {
            id: source.id,
            title: source.title || 'Unknown Source',
            channel: source.channel || 'YouTube Channel',
            url: source.url || `https://youtube.com/watch?v=${source.id}`,
            published: source.published || 'Recently',
            duration: source.duration || '—',
            score: source.score || 0,
            status: source.status || 'idle',
            completedStages: source.completedStages || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
        store.sources.push(newSource)
        saveStore(store)
        return newSource
    }
}

export function getSource(id: string): StoredSource | undefined {
    return loadStore().sources.find(s => s.id === id)
}

export function addCompletedStage(sourceId: string, stageId: string): void {
    const store = loadStore()
    const source = store.sources.find(s => s.id === sourceId)
    if (source && !source.completedStages.includes(stageId)) {
        source.completedStages.push(stageId)
        source.updatedAt = new Date().toISOString()
        saveStore(store)
    }
}
