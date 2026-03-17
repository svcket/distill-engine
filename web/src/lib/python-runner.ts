import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import fs from 'fs'

const execFileAsync = promisify(execFile)

/**
 * Manually parse .env.local to ensure sub-processes get the keys 
 * even if Next.js hasn't fully populated process.env in some contexts.
 */
function loadEnvLocal(): Record<string, string> {
    const env: Record<string, string> = {}
    try {
        const envPath = path.resolve(process.cwd(), '.env.local')
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8')
            content.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=')
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
                    env[key.trim()] = value
                }
            })
        }
    } catch (e) {
        console.error('[Python Runner] Failed to manual-load .env.local:', e)
    }
    return env
}

/**
 * Executes a python script located in the `execution/` directory.
 * The Next.js app sits in `web/`, so we navigate up to `../execution/`.
 */
export async function runPythonScript<T = unknown>(
    scriptName: string,
    args: string[] = []
): Promise<{ success: boolean; data?: T; error?: string; rawOutput?: string }> {
    try {
        const executionDir = path.resolve(process.cwd(), '../execution')
        const scriptPath = path.join(executionDir, scriptName)

        // Diagnostic: Check for API Key presence
        const localEnv = loadEnvLocal()
        // Prefer .env.local (manual load) over process.env to avoid "mock" overrides
        let apiKey = localEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY
        
        // Anti-mock safety: if the key is literally "mock", treat it as missing
        if (apiKey === 'mock') apiKey = undefined
        
        console.log(`[Python Runner] Using OPENAI_API_KEY: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`)

        console.log(`[Python Runner] Executing: python3 ${scriptName} ${args.join(' ')}`)

        const childEnv: Record<string, string | undefined> = { 
            ...process.env, 
            ...localEnv,
            PYTHONPATH: executionDir 
        }

        // Anti-mock safety: if the key is literally "mock" or "placeholder", remove it
        if (childEnv.OPENAI_API_KEY === 'mock' || childEnv.OPENAI_API_KEY === 'placeholder' || !childEnv.OPENAI_API_KEY) {
            console.log(`[Python Runner] OPENAI_API_KEY is ${childEnv.OPENAI_API_KEY || 'missing'}. Stripping for Python child process.`);
            delete childEnv.OPENAI_API_KEY
        }

        const { stdout, stderr } = await execFileAsync('python3', [scriptPath, ...args], {
            cwd: executionDir,
            timeout: 600000, // 600 second timeout
            env: childEnv as Record<string, string>, 
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
