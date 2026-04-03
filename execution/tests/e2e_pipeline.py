import sys
import os
import json
import time
import subprocess

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def run_stage(script, args):
    cmd = [sys.executable, script] + args
    print(f"--- Running Stage: {os.path.basename(script)} ---")
    print(f"Command: python3 {' '.join(cmd)}")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    duration = time.time() - start
    
    if result.returncode != 0:
        print(f"FAILED: {result.stderr}")
        return None, duration
    
    # Extract JSON line (skip debug logs)
    json_str = None
    for line in result.stdout.splitlines():
        if line.strip().startswith("{") and line.strip().endswith("}"):
            json_str = line.strip()
            # If there are multiple JSON lines, we'll try to find the one with 'status'
            try:
                data = json.loads(json_str)
                if "status" in data:
                    break
            except: continue
    
    if not json_str:
        # Some scripts might not return JSON on success but we check returncode
        print(f"NOTE: No JSON result line found in stdout.")
        return {"status": "success"}, duration
        
    try:
        data = json.loads(json_str)
        print(f"SUCCESS ({duration:.2f}s)")
        return data, duration
    except Exception as e:
        print(f"JSON Parse Error: {e}")
        return None, duration

def test_e2e(url):
    execution_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_dir = execution_dir
    tmp_dir = os.path.join(base_dir, ".tmp")
    
    total_start = time.time()
    
    # 1. Ingest
    res, _ = run_stage(os.path.join(execution_dir, "adapters/adapter_router.py"), ["--url", url, "--base-dir", base_dir, "--shell"])
    if not res: return False
    source_id = res["source_id"]
    print(f"Source ID: {source_id}\n")
    
    # Define production paths based on Results API logic
    transcript_path = os.path.join(tmp_dir, "transcripts", source_id, f"{source_id}_raw.json")
    summary_path = os.path.join(tmp_dir, "summaries", source_id, f"{source_id}_summary.md") # md is primary for summarizer
    summary_json_path = os.path.join(tmp_dir, "summaries", source_id, f"{source_id}_summary.json")
    insights_path = os.path.join(tmp_dir, "insights", f"{source_id}_insights.json")
    packet_path = os.path.join(tmp_dir, "insight_packets", f"{source_id}_packet.json")
    angle_path = os.path.join(tmp_dir, "angles", f"{source_id}_angle.json")
    draft_path = os.path.join(tmp_dir, "drafts", f"{source_id}_draft.json")
    
    # 2. Transcript
    res, _ = run_stage(os.path.join(execution_dir, "transcript_harvester.py"), ["--url", url])
    if not res: return False
    
    # 3. Summarize (Takes raw transcript, produces summary.md)
    res, _ = run_stage(os.path.join(execution_dir, "transcript_summarizer.py"), ["--input", transcript_path, "--output", summary_path])
    if not res: return False
    
    # 4. Insights (Takes summary.json, produces insights.json)
    res, _ = run_stage(os.path.join(execution_dir, "insight_extractor.py"), ["--input", summary_json_path])
    if not res: return False
    
    # 5. Build Packet (Takes transcript + insights + summary, produces packet.json)
    res, _ = run_stage(os.path.join(execution_dir, "build_insight_packet.py"), ["--source-id", source_id])
    if not res: return False
    
    # 6. Angle (Takes packet.json or insights.json, produces angle.json)
    res, _ = run_stage(os.path.join(execution_dir, "angle_strategist.py"), ["--input", insights_path])
    if not res: return False
    
    # 7. Writer (Takes angle + insights + packet, produces draft.json)
    res, _ = run_stage(os.path.join(execution_dir, "writer.py"), ["--outline_input", angle_path, "--insights_input", insights_path, "--packet_input", packet_path])
    if not res: return False
    
    # 8. Evaluation (Takes source-id, produces eval.json and updates DB in production)
    res, _ = run_stage(os.path.join(execution_dir, "evaluate_dqm.py"), ["--source-id", source_id])
    if not res: return False

    total_duration = time.time() - total_start
    print(f"\n✅ E2E PIPELINE COMPLETE IN {total_duration:.2f}s")
    
    # Verify file existence
    if os.path.exists(draft_path):
        with open(draft_path, 'r') as f:
            draft_data = json.load(f)
            content = draft_data.get('data', {}).get('content' if 'content' in draft_data.get('data', {}) else 'draft', '')
            if not content and 'draft' in draft_data: content = draft_data['draft']
            
            print(f"Resulting Draft Title: {draft_data.get('data', {}).get('title')}")
            
            # Quality Check: Subheadings
            headings = content.count("## ")
            print(f"Subheadings found: {headings}")
            if headings >= 2:
                print("🌟 SUCCESS: Subheading enforcement verified.")
            else:
                print("⚠️ WARNING: Draft lacks sufficient subheadings.")
    else:
        print(f"❌ ERROR: Draft file not found at {draft_path}")

    return True

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    args = parser.parse_args()
    
    test_e2e(args.url)
