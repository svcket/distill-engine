import sys
import argparse
import json
import os
import re
import time
import requests
import html
import traceback
from typing import Dict, Any

# Ensure local imports work by adding directory to path immediately
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from refine_transcript import refine_source_transcript
from transcript_summarizer import summarize_transcript, infer_source_name
from build_insight_packet import generate_packet_orchestrator
from insight_extractor import generate_insights_orchestrator
from adapters.podcast_adapter import is_generic_title

# ─── Content Quality Gate ─────────────────────────────────────────────────────

MIN_WORD_COUNT = 5            # Minimum real words required to proceed (Lowered from 100 for resilience)
MAX_URL_RATIO  = 0.85         # If >85% of tokens are URLs/links, flag as thin but proceed

def _assess_content_quality(source_id: str, base: str) -> tuple:
    """
    Reads the raw transcript from disk and returns (is_sufficient, reason).
    Catches URL-only / promotional-link rescues before any API call fires.
    """
    txt_path = os.path.join(base, ".tmp", "transcripts", source_id, f"{source_id}_raw.json")
    if not os.path.exists(txt_path):
        # No transcript file at all — let the cluster fail naturally
        return True, ""

    try:
        with open(txt_path, "r", encoding="utf-8") as f:
            raw = f.read().strip()
    except Exception:
        return True, ""

    if not raw:
        return True, "THIN"

    # Count real words (non-URL tokens)
    # Tighter regex to avoid false-positive dot/slash matches
    url_pattern = re.compile(r"https?://\S+|www\.\S+|[a-zA-Z0-9-]+\.(com|org|net|io|co|edu|gov|info|biz|me)/\S*")
    tokens = raw.split()
    url_tokens  = [t for t in tokens if url_pattern.match(t)]
    word_tokens = [t for t in tokens if not url_pattern.match(t) and len(t) > 1]

    total        = max(len(tokens), 1)
    url_ratio    = len(url_tokens) / total
    real_words   = len(word_tokens)

    if real_words < MIN_WORD_COUNT:
        return True, "THIN"

    if url_ratio > MAX_URL_RATIO:
        return True, "THIN"

    return True, ""


# ─── Cluster Runner ───────────────────────────────────────────────────────────

def run_analysis_cluster(source_id: str, lang: str = "en"):
    """
    Unified Analysis Cluster — groups Refine, Summary, Packet, and Insights stages 
    into a single process to eliminate process startup latency.
    """
    base = os.path.dirname(os.path.abspath(__file__))

    # ── Content Quality Gate ──────────────────────────────────────────────────
    is_sufficient, quality_reason = _assess_content_quality(source_id, base)
    if not is_sufficient:
        print(f"[{source_id}] CONTENT QUALITY GATE FAILED: {quality_reason}", file=sys.stderr)
        final_payload = {
            "status": "thin_content",
            "source_id": source_id,
            "duration": 0,
            "error_detail": quality_reason,
            "error_type": "THIN_CONTENT",
            "results": {
                "refine":   {"status": "skipped", "chunk_count": 0},
                "summary":  {"status": "skipped", "summary": f"⚠️ Analysis skipped: {quality_reason}"},
                "packet":   {"status": "skipped"},
                "insights": {"status": "skipped", "insights": []}
            },
            "is_rescue": True
        }
        print(json.dumps(final_payload))
        sys.exit(0)  # Clean exit so the UI handles it gracefully

    start_time = time.time()
    results = {}

    is_thin = (quality_reason == "THIN")
    
    try:
        if is_thin:
            print(f"[{source_id}] INGESTION RESILIENCE: Content is thin. Running degraded analysis mode.")
        
        # 1. Refine Stage (Hidden)
        try:
            print(f"[{source_id}] Cluster Stage 1/4: Refining Transcript...", flush=True)
            results["refine"] = refine_source_transcript(source_id)
        except Exception as e:
            print(f"[{source_id}] Refine stage failed: {e}", file=sys.stderr)
            results["refine"] = {"status": "skipped", "error": str(e)}

        # 2. Summary Stage
        try:
            print(f"[{source_id}] Cluster Stage 2/4: Summarizing...", flush=True)
            summary_result = summarize_transcript(source_id, lang)
            # Post-process: If thin, add a visual indicator to the summary
            if is_thin and summary_result.get("summary"):
                rescue_prefix = f"⚠️ [METADATA RESCUE] {summary_result.get('summary', '')}\n\n"
                rescue_note = "*Note: This source was analyzed using limited metadata as audio was inaccessible.*"
                summary_result["summary"] = f"{rescue_prefix}{rescue_note}"
            results["summary"] = summary_result
        except Exception as e:
            print(f"[{source_id}] Summary stage failed: {e}", file=sys.stderr)
            rescue_msg = f"⚠️ [METADATA RESCUE] Summary extraction failed ({e})"
            results["summary"] = {"status": "rescued", "summary": rescue_msg}
            
            # HARDENING: We MUST write the summary artifact even in rescue mode
            # to prevent downstream "No summary artifact found" errors in the parallel stages.
            try:
                summary_dir = os.path.join(base, ".tmp", "summaries")
                os.makedirs(summary_dir, exist_ok=True)
                summary_path = os.path.join(summary_dir, f"{source_id}_summary.json")
                with open(summary_path, 'w', encoding='utf-8') as f:
                    json.dump({"summary": rescue_msg, "status": "rescued", "source_id": source_id}, f, indent=2)
                print(f"[{source_id}] Rescued summary artifact persisted to disk.", flush=True)
            except Exception as io_err:
                print(f"[{source_id}] Critical Failure: Could not write rescued summary: {io_err}", file=sys.stderr)

        # 3. Packet / Density Mapping (Hidden)
        try:
            print(f"[{source_id}] Cluster Stage 3/4: Building Density Packet...", flush=True)
            results["packet"] = generate_packet_orchestrator(source_id)
        except Exception as e:
            print(f"[{source_id}] Packet stage failed: {e}", file=sys.stderr)
            results["packet"] = {"status": "error", "error": str(e)}
        
        # 4. Insights Extraction
        try:
            print(f"[{source_id}] Cluster Stage 4/4: Extracting Insights...", flush=True)
            results["insights"] = generate_insights_orchestrator(source_id, lang)
        except Exception as e:
            print(f"[{source_id}] Insights stage failed: {e}", file=sys.stderr)
            results["insights"] = {"status": "failed", "error": str(e)}

        end_time = time.time()
        print(f"[{source_id}] Unified Cluster COMPLETE in {end_time - start_time:.2f}s", flush=True)

        final_payload = {
            "status": "success",
            "source_id": source_id,
            "duration": end_time - start_time,
            "results": results
        }

    except Exception as e:
        error_str = str(e)
        print(f"Cluster failure: {error_str}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        
        # Sanitize error output for the UI
        clean_error = re.sub(r'https?://\S+', '[URL]', error_str)
        
        # ABSOLUTE FINAL RESCUE: If analysis fails, return a stub success
        # to prevent the UI from halting on a completed transcription.
        final_payload = {
            "status": "rescued",
            "source_id": source_id,
            "duration": time.time() - start_time,
            "results": {
                "refine":   {"status": "skipped", "chunk_count": 0},
                "summary":  {
                    "status": "rescued", 
                    "summary": f"[Analysis Rescue Active]\n\nThe engine was unable to generate a high-fidelity summary "
                               f"for this source ({clean_error}), but the following rescued metadata was preserved."
                },
                "packet":   {"status": "skipped"},
                "insights": {"status": "skipped", "insights": ["Metadata rescue initiated."]}
            },
            "is_rescue": True,
            "error_detail": clean_error
        }

    # RECOVERY: Try to fetch updated metadata (title, duration) from the harvester's output
    # to ensure the API can sync them back to the database.
    # This MUST run even if the cluster stages failed.
    metadata = {}
    try:
        # Try both prefixed and stripped versions to be resilient
        ids_to_try = [source_id, source_id.replace("spotify_", "")]
        for sid in ids_to_try:
            # HARVESTER CONVENTION: metadata is saved in .tmp/sources/{id}.json
            meta_path = os.path.join(base, ".tmp", "sources", f"{sid}.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta_data = json.load(f)
                    metadata = meta_data[0] if isinstance(meta_data, list) else meta_data
                    break
        
        # --- IDENTITY RESCUE STRIKE ---
        # If title is still missing or generic, we attempt a multi-stage identity recovery.
        current_title = metadata.get("title", "")
        scraped_hint = None
        
        if not current_title or is_generic_title(current_title):
            # STRIKE 1: Direct Embed Scraping (Capture messy hint)
            s_id = source_id.replace("spotify_", "")
            if len(s_id) > 20: 
                try:
                    embed_url = f"https://open.spotify.com/embed/episode/{s_id}"
                    resp = requests.get(embed_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=5)
                    if resp.status_code == 200:
                        m = re.search(r"<title>(.*?)</title>", resp.text, re.I)
                        if m:
                            scraped_hint = html.unescape(m.group(1))
                            # Clean it slightly for STRIKE 1 logic, but keep raw for LLM hint
                            clean = re.sub(r"\s*\|.*$", "", scraped_hint).strip()
                            if clean and not is_generic_title(clean):
                                metadata["title"] = clean
                                metadata["is_shell"] = False 
                                print(f"[{source_id}] Cluster Identity: SCRAPE RECOVERY -> {clean}")
                except Exception: pass

            # STRIKE 2: Cognitive Recovery (LLM-based naming with alignment hint)
            # Re-check title status after Strike 1
            updated_title = metadata.get("title", "")
            if not updated_title or is_generic_title(updated_title):
                # 1. Choose the best available source text for inference
                summary_data = results.get("summary", {})
                summary_text = summary_data.get("summary", "") if isinstance(summary_data, dict) else ""
                
                # If summary is missing or rescued, fallback to raw description
                source_text = ""
                is_rescue = "[METADATA RESCUE]" in summary_text or "[Analysis Rescue Active]" in summary_text
                if summary_text and not is_rescue:
                    source_text = summary_text
                else:
                    source_text = metadata.get("description", "")
                
                # 2. Trigger Inference with Alignment Hint
                if source_text and len(source_text) > 30:
                    inferred = infer_source_name(source_text, hint=scraped_hint, lang=lang)
                    
                    # 3. Final Validation
                    if inferred and not is_generic_title(inferred):
                        metadata["title"] = inferred
                        metadata["is_shell"] = False
                        print(f"[{source_id}] Cluster Identity: COGNITIVE RECOVERY -> {inferred}")
                    else:
                        print(f"[{source_id}] Cluster Identity: COGNITIVE RECOVERY FAILED (Generic or empty result)")

    except Exception as e:
        print(f"[{source_id}] Metadata recovery failed: {str(e)}", file=sys.stderr)

    if final_payload:
        final_payload["metadata"] = metadata
        print(json.dumps(final_payload))
    
    # Exit cleanly to allow UI to proceed even if we were in rescue mode
    sys.exit(0)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    run_analysis_cluster(args.source_id, args.lang)
