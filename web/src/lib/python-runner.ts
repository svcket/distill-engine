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
        .substring(0, 10000)
}

/**
 * Manually parse .env.local for local development.
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
        // Non-fatal
    }
    return env
}

/**
 * REMOTE EXECUTION (Vercel -> Railway)
 */
async function runPythonScriptRemote<T>(
    scriptName: string,
    args: string[],
    options: { env?: Record<string, string> } = {}
): Promise<{ success: boolean; data?: T; error?: string; rawOutput?: string }> {
    const backendUrl = process.env.BACKEND_URL
    const apiKey = process.env.INTERNAL_API_KEY

    if (!backendUrl) throw new Error('BACKEND_URL not set for remote execution')

    try {
        console.log(`[Python Runner] Proxying to Remote Backend: ${backendUrl}/run (${scriptName})`)
        
        const response = await fetch(`${backendUrl}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey || ''
            },
            body: JSON.stringify({
                script: scriptName,
                args: args,
                env_overrides: options.env
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            return {
                success: false,
                error: `Remote Backend Error (${response.status}): ${errorText}`
            }
        }

        const result = await response.json()
        return {
            success: result.success,
            data: result.data as T,
            error: result.error,
            rawOutput: result.stdout
        }
    } catch (err: any) {
        console.error('[Python Runner] Remote proxy failed:', err)
        return {
            success: false,
            error: `Failed to connect to remote backend: ${err.message}`
        }
    }
}

/**
 * LOCAL EXECUTION (Railway / Dev)
 */
async function runPythonScriptLocal<T>(
    scriptName: string,
    args: string[] = [],
    options: { expectedArtifact?: string; env?: Record<string, string> } = {}
): Promise<{ success: boolean; data?: T; error?: string; rawOutput?: string }> {
    const executionDir = path.resolve(process.cwd(), '../execution')
    const scriptPath = path.join(executionDir, scriptName)

    const localEnv = loadEnvLocal()
    // AGGRESSIVE PRODUCTION FALLBACK: Always try /tmp first for production resilience
    const tmpDir = fs.existsSync('/tmp') ? '/tmp' : path.resolve(executionDir, '.tmp')
    
    const childEnv: Record<string, string | undefined> = { 
        ...process.env, 
        ...localEnv,
        ...options.env,
        PYTHONPATH: executionDir,
        DISTILL_TMP_DIR: tmpDir
    }

    // Safety: strip "mock" keys
    if (childEnv.OPENAI_API_KEY === 'mock' || !childEnv.OPENAI_API_KEY) {
        delete childEnv.OPENAI_API_KEY
    }

    const { stdout, stderr } = await execFileAsync('python3', [scriptPath, ...args], {
        cwd: executionDir,
        timeout: 600000, 
        env: childEnv as NodeJS.ProcessEnv, 
    })

    const output = stdout.trim()

    // Artifact verification
    if (options.expectedArtifact) {
        const artifactPath = path.isAbsolute(options.expectedArtifact) 
            ? options.expectedArtifact 
            : path.join(executionDir, options.expectedArtifact)
        
        if (!fs.existsSync(artifactPath) || fs.statSync(artifactPath).size === 0) {
            return { 
                success: false, 
                error: `Pipeline Stage Failed: Artifact missing or empty at ${options.expectedArtifact}`,
                rawOutput: output 
            }
        }
    }

    try {
        const lines = output.split('\n')
        const possibleJson = [...lines].reverse().find(l => l.trim().startsWith('{') || l.trim().startsWith('['))
        const data = possibleJson ? JSON.parse(possibleJson) : JSON.parse(output)
        return { success: true, data: data as T, rawOutput: output }
    } catch (err) {
        return { 
            success: false, 
            error: `Pipeline Stage Failed: Malformed JSON output.`,
            rawOutput: output 
        }
    }
}

/**
 * Universal Entrypoint
 */
export async function runPythonScript<T = unknown>(
    scriptName: string,
    args: string[] = [],
    options: { expectedArtifact?: string; env?: Record<string, string> } = {}
): Promise<{ success: boolean; data?: T; error?: string; rawOutput?: string }> {
    
    // DECISION: Use remote backend if BACKEND_URL is defined (production "split" mode)
    // NOTE: In Railway, we won't set BACKEND_URL, so it will run local.
    // In Vercel, we will set BACKEND_URL, so it will proxy to Railway.
    if (process.env.BACKEND_URL && process.env.NODE_ENV === 'production') {
        return runPythonScriptRemote<T>(scriptName, args, options)
    }

    return runPythonScriptLocal<T>(scriptName, args, options)
}
