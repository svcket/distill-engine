import path from 'path'
import os from 'os'
import fs from 'fs'

/**
 * Returns a writable temporary directory path and ensures it exists.
 * In production (Vercel), we prioritize /tmp.
 * In development, we use .tmp in the execution directory.
 */
export function getSafeTmpDir(subDir: string = ''): string {
    // AGGRESSIVE PRODUCTION FALLBACK: Try system /tmp first, then os.tmpdir, then local.
    // This removes reliance on environment variables that might be missing in certain contexts.
    let baseDir = '/tmp'
    
    try {
        if (!fs.existsSync(baseDir)) {
            baseDir = os.tmpdir()
        }
    } catch (e) {
        baseDir = path.resolve(process.cwd(), '../execution/.tmp')
    }

    const targetDir = subDir ? path.join(baseDir, subDir) : baseDir

    try {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
        }
    } catch (e) {
        // Final fallback if /tmp is strictly forbidden (unlikely on Vercel)
        const fallback = path.resolve(process.cwd(), '../execution/.tmp', subDir)
        if (!fs.existsSync(fallback)) {
            fs.mkdirSync(fallback, { recursive: true })
        }
        return fallback
    }

    return targetDir
}

export function getSafeTmpPath(fileName: string, subDir: string = ''): string {
    return path.join(getSafeTmpDir(subDir), fileName)
}
