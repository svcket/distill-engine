import os
import subprocess
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# --- LOGGING CONFIG ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("distill-backend")

app = FastAPI(title="Distill Engine Backend API")

# --- MODELS ---
class RunRequest(BaseModel):
    script: str
    args: List[str] = []
    env_overrides: Optional[dict] = None

# --- AUTHENTICATION ---
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY")

async def verify_token(x_api_key: str = Header(None)):
    if not INTERNAL_API_KEY:
        logger.warning("INTERNAL_API_KEY not set in environment. Access may be blocked.")
        raise HTTPException(status_code=500, detail="Backend configuration error (missing security key)")
    
    if x_api_key != INTERNAL_API_KEY:
        key_preview = f"{x_api_key[:4]}..." if x_api_key else "None"
        logger.warning(f"Unauthorized access attempt with key: {key_preview}")
        raise HTTPException(status_code=401, detail="Unauthorized")

# --- ENDPOINTS ---

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/run")
async def run_script(run_req: RunRequest, request: Request, x_api_key: str = Header(None)):
    # Verify token manually since we are using FastAPI Request for headers in some cases
    await verify_token(x_api_key)

    script_name = run_req.script
    args = run_req.args
    
    # SECURITY: Prevent path traversal
    if ".." in script_name or "/" in script_name:
        raise HTTPException(status_code=400, detail="Invalid script name")

    execution_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(execution_dir, script_name)

    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"Script {script_name} not found")

    logger.info(f"Executing: python3 {script_name} {' '.join(args)}")

    # Prepare environment
    env = os.environ.copy()
    env["PYTHONPATH"] = execution_dir
    if run_req.env_overrides:
        env.update(run_req.env_overrides)

    try:
        # Run the script
        # We use a 10-minute timeout to match the Next.js runner
        process = subprocess.run(
            ["python3", script_path] + args,
            cwd=execution_dir,
            capture_output=True,
            text=True,
            env=env,
            timeout=600 
        )

        stdout = process.stdout.strip()
        stderr = process.stderr.strip()

        if stderr:
            logger.warning(f"Script stderr: {stderr}")

        # Attempt to parse JSON from stdout (the last JSON-like line)
        result_data = None
        try:
            lines = stdout.split('\n')
            possible_json = next((l.strip() for l in reversed(lines) if l.strip().startswith('{') or l.strip().startswith('[')), None)
            if possible_json:
                result_data = json.loads(possible_json)
            else:
                result_data = {"raw_output": stdout}
        except Exception:
            result_data = {"raw_output": stdout}

        return {
            "success": process.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
            "data": result_data,
            "returncode": process.returncode
        }

    except subprocess.TimeoutExpired:
        logger.error(f"Execution timed out: {script_name}")
        return JSONResponse(
            status_code=504,
            content={"success": False, "error": "Script execution timed out"}
        )
    except Exception as e:
        logger.error(f"Execution failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
