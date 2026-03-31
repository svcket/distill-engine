import sys
import argparse
import json
import os
import time
from typing import Dict, Any

def run_analysis_cluster(source_id: str):
    """
    Unified Analysis Cluster — groups Refine, Summary, Packet, and Insights stages 
    into a single process to eliminate process startup latency.
    """
    base = os.path.dirname(__file__)
    # Add base to sys.path to ensure local imports work when run from anywhere
    if base not in sys.path:
        sys.path.append(base)
        
    # Import existing logic from individual scripts
    from refine_transcript import refine_source_transcript
    from transcript_summarizer import summarize_transcript
    from build_insight_packet import generate_packet_orchestrator
    from insight_extractor import generate_insights_orchestrator

    start_time = time.time()
    results = {}

    print(f"[{source_id}] Starting Unified Analysis Cluster...", flush=True)

    try:
        # 1. Refine Stage (Hidden)
        print(f"[{source_id}] Cluster Stage 1/4: Refining Transcript...", flush=True)
        refine_result = refine_source_transcript(source_id)
        results["refine"] = refine_result

        # 2. Summary Stage
        print(f"[{source_id}] Cluster Stage 2/4: Summarizing...", flush=True)
        summary_result = summarize_transcript(source_id)
        results["summary"] = summary_result
        
        # 3. Packet / Density Mapping (Hidden)
        print(f"[{source_id}] Cluster Stage 3/4: Building Density Packet...", flush=True)
        packet_result = generate_packet_orchestrator(source_id)
        results["packet"] = packet_result
        
        # 4. Insights Extraction
        print(f"[{source_id}] Cluster Stage 4/4: Extracting Insights...", flush=True)
        insights_result = generate_insights_orchestrator(source_id)
        results["insights"] = insights_result

        end_time = time.time()
        print(f"[{source_id}] Unified Cluster COMPLETE in {end_time - start_time:.2f}s", flush=True)

        # Payload follows the standard expected by the API routes
        final_payload = {
            "status": "success",
            "source_id": source_id,
            "duration": end_time - start_time,
            "results": results
        }
        
        print(json.dumps(final_payload))

    except Exception as e:
        import traceback
        print(f"Cluster failure: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            "status": "error",
            "error_detail": f"Cluster failure: {str(e)}"
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    args = parser.parse_args()
    run_analysis_cluster(args.source_id)
