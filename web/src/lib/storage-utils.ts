import path from 'path'
import fs from 'fs'

/**
 * Cleanup all file-based artifacts for a given source ID.
 * This prevents disk bloat when a user deletes a source in the UI.
 */
export function deleteSourceFiles(sourceId: string) {
    const baseDir = path.resolve(process.cwd(), '../execution/.tmp')
    
    // List of directories that contain source-specific files
    const artifactDirs = [
        'transcripts',
        'refined_transcripts',
        'summaries',
        'insight_packets',
        'insights',
        'angles',
        'drafts',
        'evaluations',
        'visual_plans',
        'sources'
    ]

    artifactDirs.forEach(dir => {
        const dirPath = path.join(baseDir, dir)
        if (!fs.existsSync(dirPath)) return

        // 1. Direct folder named after sourceId (transcripts, refined_transcripts, summaries)
        const subfolder = path.join(dirPath, sourceId)
        if (fs.existsSync(subfolder) && fs.lstatSync(subfolder).isDirectory()) {
            try {
                fs.rmSync(subfolder, { recursive: true, force: true })
                // console.log(`[Storage Cleanup] Deleted folder: ${subfolder}`)
            } catch (err) {
                console.error(`[Storage Cleanup] Failed to delete folder ${subfolder}:`, err)
            }
        }

        // 2. Individual files named [sourceId]*
        try {
            const files = fs.readdirSync(dirPath)
            files.forEach(file => {
                if (file.startsWith(sourceId)) {
                    const filePath = path.join(dirPath, file)
                    if (fs.lstatSync(filePath).isFile()) {
                        fs.unlinkSync(filePath)
                        // console.log(`[Storage Cleanup] Deleted file: ${filePath}`)
                    }
                }
            })
        } catch (err) {
            console.error(`[Storage Cleanup] Error scanning dir ${dirPath}:`, err)
        }
    })
}
