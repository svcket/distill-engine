import path from 'path'
import os from 'os'
import fs from 'fs'

const IS_VERCEL = process.env.VERCEL === '1' || !!process.env.NEXT_PUBLIC_VERCEL_URL

/**
 * Returns a writable temporary directory path and ensures it exists.
 * In Vercel, this is always /tmp.
 * In local/dev, it's relative to the execution directory.
 */
export function getSafeTmpDir(subDir: string = ''): string {
    const baseDir = IS_VERCEL 
        ? os.tmpdir()
        : path.resolve(process.cwd(), '../execution/.tmp')

    const targetDir = subDir ? path.join(baseDir, subDir) : baseDir

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
    }

    return targetDir
}

/**
 * Returns a safe path for a specific file within the temporary directory.
 */
export function getSafeTmpPath(fileName: string, subDir: string = ''): string {
    return path.join(getSafeTmpDir(subDir), fileName)
}
