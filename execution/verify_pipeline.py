from fs_utils import get_safe_tmp_dir, get_safe_tmp_path
import os
import json
import argparse

def verify_pipeline(source_id):
    base_dir = get_safe_tmp_dir()
    
    stages = {
        "transcript": os.path.join(base_dir, "transcripts", source_id, f"{source_id}_raw.json"),
        "refine": os.path.join(base_dir, "refined_transcripts", source_id, f"{source_id}_refined.json"),
        "summary": os.path.join(base_dir, "summaries", source_id, f"{source_id}_summary.json"),
        "packet": os.path.join(base_dir, "insight_packets", f"{source_id}_packet.json"),
        "insights": os.path.join(base_dir, "insights", f"{source_id}_insights.json"),
        "angle": os.path.join(base_dir, "angles", f"{source_id}_angle.json"),
        "outline": os.path.join(base_dir, "outlines", f"{source_id}_outline.json"),
        "draft": os.path.join(base_dir, "drafts", f"{source_id}_draft.json"),
        "evaluation": os.path.join(base_dir, "evaluations", f"{source_id}_eval.json"),
        "judge": os.path.join(base_dir, "sources", f"{source_id}.json")
    }
    
    report = {
        "source_id": source_id,
        "base_dir": base_dir,
        "stages": {},
        "integrity": "pass"
    }
    
    for stage, path in stages.items():
        exists = os.path.exists(path)
        stage_info = {
            "exists": exists,
            "path": path,
            "valid_json": False,
            "size_bytes": 0
        }
        
        if exists:
            stage_info["size_bytes"] = os.path.getsize(path)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                    stage_info["valid_json"] = True
                    # Check for empty data
                    if stage == "draft":
                        text = content.get("data", {}).get("content", "") or content.get("content", "")
                        if not text or len(text.strip()) < 50:
                            stage_info["warning"] = "Draft content looks suspiciously short or empty."
                            report["integrity"] = "warning"
            except Exception as e:
                stage_info["error"] = str(e)
                report["integrity"] = "fail"
        
        report["stages"][stage] = stage_info
        
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    args = parser.parse_args()
    verify_pipeline(args.source_id)
