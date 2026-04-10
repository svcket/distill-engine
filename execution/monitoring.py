import os
import json
import datetime

# Helper to log harvester rescue attempts for analytics and reliability tracking
MONITOR_DIR = os.path.join(os.path.dirname(__file__), '.tmp', 'monitoring')
MONITOR_FILE = os.path.join(MONITOR_DIR, 'rescue_stats.json')

def log_rescue_attempt(platform, result, message=""):
    """
    Log a rescue attempt to a JSON file.
    platform: 'spotify' | 'youtube' | 'apple'
    result: 'success' | 'failure'
    """
    try:
        os.makedirs(MONITOR_DIR, exist_ok=True)
        
        # Initial structure
        data = {"attempts": [], "stats": {"success": 0, "failure": 0}}
        
        # Load existing if available
        if os.path.exists(MONITOR_FILE):
            try:
                with open(MONITOR_FILE, 'r') as f:
                    existing = json.load(f)
                    if isinstance(existing, dict):
                        if "attempts" in existing and isinstance(existing["attempts"], list):
                            data["attempts"] = existing["attempts"]
                        if "stats" in existing and isinstance(existing["stats"], dict):
                            data["stats"] = existing["stats"]
            except Exception as load_err:
                print(f"[Monitoring] Warning: Could not parse existing stats: {load_err}")
            
        # Append new attempt
        data["attempts"].append({
            "timestamp": datetime.datetime.now().isoformat(),
            "platform": platform,
            "result": result,
            "message": message
        })
        
        # Update aggregate stats
        data["stats"][result] = data["stats"].get(result, 0) + 1
        
        # Keep last 100 attempts for detail
        if len(data["attempts"]) > 100:
            data["attempts"] = data["attempts"][-100:]
        
        # Atomic-ish write (to avoid corruption)
        tmp_file = MONITOR_FILE + ".tmp"
        with open(tmp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_file, MONITOR_FILE)
        
    except Exception as e:
        print(f"[Monitoring] Failed to log rescue attempt: {e}")

if __name__ == "__main__":
    # Self-test
    log_rescue_attempt("test", "success", "System check")
    print(f"Log updated at {MONITOR_FILE}")
    if os.path.exists(MONITOR_FILE):
        with open(MONITOR_FILE, "r") as f:
            print("Current Stats:", json.load(f).get("stats"))
