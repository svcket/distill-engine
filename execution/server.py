import os
import subprocess
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- LOGGING CONFIG ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("distill-backend")

app = FastAPI(title="Distill Engine Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def resolve_file_path(base_dir: str, folder: str, source_id: str, suffix: str) -> Optional[str]:
    paths_to_try = [
        os.path.join(base_dir, folder, source_id, f"{source_id}{suffix}"),
        os.path.join(base_dir, folder, f"{source_id}{suffix}"),
    ]
    
    # Handle spotify_ prefix variations
    stripped_id = source_id.replace("spotify_", "")
    if source_id.startswith("spotify_"):
        paths_to_try.extend([
            os.path.join(base_dir, folder, stripped_id, f"{stripped_id}{suffix}"),
            os.path.join(base_dir, folder, f"{stripped_id}{suffix}"),
        ])
    else:
        spotify_id = f"spotify_{source_id}"
        paths_to_try.extend([
            os.path.join(base_dir, folder, spotify_id, f"{spotify_id}{suffix}"),
            os.path.join(base_dir, folder, f"{spotify_id}{suffix}"),
        ])

    for p in paths_to_try:
        if os.path.exists(p):
            return p
    return None

@app.get("/results/{source_id}")
async def get_results(source_id: str, x_api_key: str = Header(None)):
    await verify_token(x_api_key)
    
    execution_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.join(execution_dir, ".tmp")
    
    if not os.path.exists(base_dir):
        return {"results": {}}

    folders = {
        "insights": "_insights.json",
        "angle": "_angle.json",
        "draft": "_draft.json",
        "packet": "_packet.json",
        "transcript": "_raw.json",
        "refine": "_refined.json",
        "summary": "_summary.json",
        "qa": "_eval.json",
        "visual": "_visual_plan.json",
        "socialise": "_thread.json",
    }
    
    results = {}
    for stage_id, suffix in folders.items():
        folder_name = stage_id
        # Special folder mappings
        if stage_id == "angle": folder_name = "angles"
        if stage_id == "draft": folder_name = "drafts"
        if stage_id == "packet": folder_name = "insight_packets"
        if stage_id == "transcript": folder_name = "transcripts"
        if stage_id == "refine": folder_name = "refined_transcripts"
        if stage_id == "summary": folder_name = "summaries"
        if stage_id == "qa": folder_name = "evaluations"
        if stage_id == "visual": folder_name = "visual_plans"

        file_path = resolve_file_path(base_dir, folder_name, source_id, suffix)
        if file_path:
            try:
                with open(file_path, 'r') as f:
                    results[stage_id] = json.load(f)
            except Exception as e:
                logger.error(f"Error reading {file_path}: {e}")

    # Metadata check
    score_path = os.path.join(base_dir, "sources", f"{source_id}.json")
    if os.path.exists(score_path):
        try:
            with open(score_path, 'r') as f:
                meta = json.load(f)
                item = meta[0] if isinstance(meta, list) else meta
                results["judge"] = {
                    "score": item.get("score", 5),
                    "title": item.get("title"),
                    "channel": item.get("channel"),
                    "status": "done",
                    "rationale": item.get("rationale", "Source evaluated.")
                }
        except Exception as e:
            logger.error(f"Error reading metadata {score_path}: {e}")

    return {"results": results}

@app.post("/run")
async def run_script(run_req: RunRequest, request: Request, x_api_key: str = Header(None)):
    # Verify token manually since we are using FastAPI Request for headers in some cases
    await verify_token(x_api_key)

    script_name = run_req.script
    args = run_req.args
    
    # SECURITY: Prevent path traversal (allow subdirectories like adapters/)
    if ".." in script_name or script_name.startswith("/"):
        logger.warning(f"Blocked invalid script path attempt: {script_name}")
        raise HTTPException(status_code=400, detail="Invalid script path (traversal blocked)")

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
