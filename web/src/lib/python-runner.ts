import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Executes a python script located in the `execution/` directory.
 * The Next.js app sits in `web/`, so we navigate up to `../execution/`.
 */
export async function runPythonScript<T = unknown>(
    scriptName: string,
    args: string[] = []
): Promise<{ success: boolean; data?: T; error?: string; rawOutput?: string }> {
    try {
        // Determine absolute path to execution dir. 
        // Assuming structure: root/web/ and root/execution/
        const executionDir = path.resolve(process.cwd(), '../execution')
        const scriptPath = path.join(executionDir, scriptName)

        console.log(`[Python Runner] Executing: python3 ${scriptName} ${args.join(' ')}`)

        const { stdout, stderr } = await execFileAsync('python3', [scriptPath, ...args], {
            cwd: executionDir,
            timeout: 600000, // 600 second timeout (large podcast transcribing can take minutes)
            env: { ...process.env }, // Explicitly forward all env vars (YOUTUBE_API_KEY, OPENAI_API_KEY, etc.)
        })

        if (stderr && stderr.trim() !== '') {
            // Some modules write warnings to stderr, but we log them.
            console.warn(`[Python Runner] Warning/Stderr from ${scriptName}:`, stderr)
        }

        const output = stdout.trim()

        // The scripts currently just print status messages (e.g. "Scouting for... (Not implemented)").
        // If they returned valid JSON, we would parse it here.
        // Let's try to parse it, but if it fails, just return the raw string.
        try {
            // Find the last line that looks like JSON or just try parsing the whole thing
            // since the Python scripts print diagnostic text before the JSON payload 
            // in production we should ensure scripts ONLY print JSON to stdout.

            const lines = output.split('\n')
            // Reversing so if there are multiple JSON-like lines (e.g. warnings), we get the actual final output payload
            const possibleJson = [...lines].reverse().find(l => l.trim().startsWith('{') || l.trim().startsWith('['))

            if (possibleJson) {
                const data = JSON.parse(possibleJson) as T
                return { success: true, data, rawOutput: possibleJson }
            }

            // Fallback: try parsing the entire output
            const data = JSON.parse(output) as T
            return { success: true, data, rawOutput: output }

        } catch {
            // Scripts currently just print strings.
            // E.g.: "Scouting for 'query' (max 5 results)... (Not implemented)"
            return { success: true, data: undefined, rawOutput: output }
        }

    } catch (error: unknown) {
        const err = error as { message?: string; stdout?: string }
        console.error(`[Python Runner] Error executing ${scriptName}:`, err)
        return {
            success: false,
            error: err.message || 'Unknown execution error',
            rawOutput: err.stdout || undefined
        }
    }
}
