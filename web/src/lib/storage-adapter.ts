import fs from 'fs'
import path from 'path'
import { supabaseAdmin } from './supabase'

/**
 * Composite Storage Adapter
 * Bridges the gap between local development (fs) and production (Supabase Storage).
 */
export const StorageAdapter = {
  /**
   * Fetch a transcript or draft JSON result.
   * Tries local disk first (for dev performance), falls back to cloud storage.
   */
  async getJson(category: string, filename: string): Promise<Record<string, unknown> | null> {
    const baseDir = path.resolve(process.cwd(), '../execution/.tmp')
    const localDir = path.join(baseDir, path.normalize(category).replace(/^(\.\.(\/|\\|$))+/, ''))
    const localPath = path.join(localDir, path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, ''))

    // Verify the resolved path is still inside baseDir
    if (!localPath.startsWith(baseDir)) {
      console.warn(`[StorageAdapter] Potential path traversal attempt rejected: ${category}/${filename}`)
      return null
    }

    // 1. Try local disk (Development)
    if (fs.existsSync(localPath)) {
      try {
        const raw = fs.readFileSync(localPath, 'utf-8')
        return JSON.parse(raw)
      } catch (err) {
        console.warn(`[StorageAdapter] Local read failed for ${localPath}:`, err)
      }
    }

    // 2. Try Supabase Storage (Production)
    try {
      const { data, error } = await supabaseAdmin
        .storage
        .from(category)
        .download(filename)

      if (error) throw error
      if (data) {
        const text = await data.text()
        return JSON.parse(text)
      }
    } catch (err) {
      console.error(`[StorageAdapter] Cloud read failed for ${category}/${filename}:`, err)
    }

    return null
  },

  /**
   * Upload an artifact to the cloud.
   * Typically used after an ingestion or refinement stage completes.
   */
  async upload(category: string, filename: string, body: string | Buffer) {
    const { data, error } = await supabaseAdmin
      .storage
      .from(category)
      .upload(filename, body, {
        upsert: true,
        contentType: 'application/json'
      })

    if (error) {
      console.error(`[StorageAdapter] Upload failed for ${category}/${filename}:`, error)
      return null
    }

    return data
  }
}
