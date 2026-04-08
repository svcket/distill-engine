import { execFile } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import fs from 'fs'

const execFileAsync = promisify(execFile)

/**
 * Redacts sensitive info (API keys, large content, URLs) from logs.
 */
function redactSensitiveData(text: string): string {
    if (!text) return text
    return text
        .replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]')
        .replace(/"content":\s*".*?"/g, '"content": "[REDACTED_CONTENT]"')
        .replace(/"text":\s*".*?"/g, '"text": "[REDACTED_TEXT]"')
        // Cap large blocks to prevent log bloat
        .substring(0, 10000)
}

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
    args: string[] = [],
    options: { expectedArtifact?: string; env?: Record<string, string> } = {}
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
            ...options.env,
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
            env: childEnv as NodeJS.ProcessEnv, 
        })

        // Persistent Logging: Write output to .tmp/logs for observability
        try {
            if (process.env.DEBUG_LOGS === 'true') {
                const logDir = path.join(executionDir, '.tmp', 'logs')
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
                const logFile = path.join(logDir, `${scriptName.replace(/\.py$/, '')}.log`)
                const timestamp = new Date().toISOString()
                const sanitizedStdout = redactSensitiveData(stdout)
                const sanitizedStderr = redactSensitiveData(stderr)
                const logContent = `\n--- ${timestamp} ---\nCOMMAND: python3 ${scriptName} ${args.join(' ')}\nSTDOUT:\n${sanitizedStdout}\nSTDERR:\n${sanitizedStderr}\n`
                fs.appendFileSync(logFile, logContent)
            }
        } catch (logErr) {
            console.error('[Python Runner] Failed to write to log file:', logErr)
        }

        if (stderr && stderr.trim() !== '') {
            // Some modules write warnings to stderr, but we log them.
            console.warn(`[Python Runner] Warning/Stderr from ${scriptName}:`, stderr)
        }

        const output = stdout.trim()

        // TRUTH CHECK: If an artifact is expected, verify it exists and is not empty
        if (options.expectedArtifact) {
            const artifactPath = path.isAbsolute(options.expectedArtifact) 
                ? options.expectedArtifact 
                : path.join(executionDir, options.expectedArtifact)
            
            if (!fs.existsSync(artifactPath)) {
                return { 
                    success: false, 
                    error: `Pipeline Stage Failed: Expected artifact missing at ${options.expectedArtifact}`,
                    rawOutput: output 
                }
            }
            
            const stats = fs.statSync(artifactPath)
            if (stats.size === 0) {
                return { 
                    success: false, 
                    error: `Pipeline Stage Failed: Produced artifact is empty at ${options.expectedArtifact}`,
                    rawOutput: output 
                }
            }
        }

        // Parse result from Python output
        try {
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

        } catch (err) {
            console.error(`[Python Runner] Failed to parse JSON from ${scriptName}:`, err)
            return { 
                success: false, 
                error: `Pipeline Stage Failed: Malformed output from script.`,
                rawOutput: output 
            }
        }

    } catch (error: unknown) {
        const err = error as { message?: string; stdout?: string; stderr?: string }
        console.error(`[Python Runner] Error executing ${scriptName}:`, err)
        
        // Ensure failed attempts are also logged
        try {
            if (process.env.DEBUG_LOGS === 'true') {
                const executionDir = path.resolve(process.cwd(), '../execution')
                const logDir = path.join(executionDir, '.tmp', 'logs')
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
                const logFile = path.join(logDir, `${scriptName.replace(/\.py$/, '')}.log`)
                const timestamp = new Date().toISOString()
                const sanitizedMsg = redactSensitiveData(err.message || '')
                const sanitizedStdout = redactSensitiveData(err.stdout || '')
                const sanitizedStderr = redactSensitiveData(err.stderr || '')
                const logContent = `\n--- ${timestamp} ---\nERROR: ${sanitizedMsg}\nSTDOUT:\n${sanitizedStdout}\nSTDERR:\n${sanitizedStderr}\n`
                fs.appendFileSync(logFile, logContent)
            }
        } catch {}

        return {
            success: false,
            error: err.message || 'Unknown execution error',
            rawOutput: err.stdout || undefined
        }
    }
}
