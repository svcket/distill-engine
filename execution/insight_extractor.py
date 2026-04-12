import sys
import os

# Ensure local imports work by adding directory to path immediately
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import argparse
import json
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from openai import OpenAI
from fs_utils import get_safe_tmp_dir, get_safe_tmp_path

def generate_insights_orchestrator(source_id: str, lang: str = "en") -> Dict[str, Any]:
    """Convenience wrapper for the Unified Analysis Cluster."""
    packet_path = get_safe_tmp_path(f"{source_id}_packet.json", "insight_packets")
    return extract_insights(packet_path, lang)

class Framework(BaseModel):
    title: str = Field(description="Name of the framework or model.")
    description: str = Field(description="Brief description of what the framework does.")

class InsightExtraction(BaseModel):
    core_argument: str = Field(
        description="The singular, overarching argument or point of the source."
    )
    key_claims: List[str] = Field(description="The primary claims or assertions that support the core argument.")
    supporting_examples: List[str] = Field(
        description="Concrete historical cases, data points, or anecdotes used as proof."
    )
    frameworks: List[Framework] = Field(description="Specific models, metrics, or step-by-step systems mentioned.")
    controversies: List[str] = Field(description="Debates, tensions, or controversial views raised by the source.")
    contradictions: List[str] = Field(description="Any contradictions or counterintuitive points made.")
    implications: List[str] = Field(description="The 'so what?'-the second-order effects of the claims.")
    memorable_quotes: List[str] = Field(description="Exact, verbatim impactful lines.")
    speaker_identity: str = Field(
        description="Who is speaking or who authored this source? (Name, role, or assumed identity if not explicitly stated)."
    )
    source_context: str = Field(
        description="The overarching theme, publication, or platform context of this knowledge."
    )

def load_json(filepath: str):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception: return None
    return None

def extract_insights(packet_path: str, lang: str = "en") -> Dict[str, Any]:
    if not os.path.exists(packet_path):
        raise FileNotFoundError(f"Packet not found: {packet_path}")
        
    packet = load_json(packet_path)
    if not packet or not isinstance(packet, dict):
        raise ValueError(f"Invalid or empty packet at: {packet_path}")

    source_id = packet.get("source_id") or packet.get("video_id") or "unknown"
    
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"]:
        # Mock fallback for UI testing without keys
        mock_result = {
            "status": "success_mocked",
            "source_id": source_id,
            "data": {
                "core_argument": "Mock Argument: Agentic systems require decoupled intelligence routing.",
                "key_claims": ["Monolithic agents fail at scale", "Routing determines system reliability"],
                "supporting_examples": ["The 2024 AI agent crash", "Using decoupled orchestration layers"],
                "frameworks": [{"title": "Agentic Loop", "description": "Observe, orient, decide, act."}],
                "controversies": ["Are LLMs necessary for basic routing?"],
                "contradictions": ["Faster models aren't always better orchestrators."],
                "implications": ["End-user applications will become primarily declarative."],
                "memorable_quotes": ["This is a mock quote from the extraction engine."],
                "speaker_identity": "Senior System Architect / AI Researcher",
                "source_context": "Technical presentation on modern AI infrastructure"
            }
        }
        
        out_dir = get_safe_tmp_dir("insights")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_insights.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(mock_result, f, indent=2)
            
        return mock_result

    client = OpenAI()
    
    # We pass the refined transcript chunks to the context window
    segments = packet.get("transcript_segments", [])
    is_rescued = False
    
    if not segments:
        # FALLBACK: If no segments, try to use the description or rescued text from metadata/judgment
        meta = packet.get("metadata", {})
        judg = packet.get("judgment", {})
        
        description = meta.get("description") or \
                     meta.get("show_notes") or \
                     meta.get("raw_metadata", {}).get("description") or \
                     meta.get("excerpt")
        
        # If the summary stage produced a rescue message, it might be in the summary file
        # which is NOT in the packet yet. But we have results in the cluster if called via orchestrator.
        # Check for shell/rescued messages
        if description and "Analysis Rescue Active" in description:
            # Try to find something better than just the rescue message
            description = meta.get("title") or description

        if description:
            transcript_text = f"[Source Description/Context]: {description}"
            is_rescued = True
        else:
            # --- THIN CONTENT GATE ---
            # If no transcript and no description, do NOT proceed to LLM.
            # This prevents the LLM from hallucinating 'Strategic Execution of Pipelines' from empty input.
            print(json.dumps({"type": "status", "text": "Insufficient content for strategic extraction. Aborting."}), flush=True)
            return {
                "status": "thin_content",
                "source_id": source_id,
                "error": "No transcript or description available for analysis.",
                "data": {
                    "core_argument": "Analysis Paused: Insufficient Source Data",
                    "key_claims": ["The source provider has restricted access to content."],
                    "supporting_examples": [],
                    "frameworks": [],
                    "controversies": [],
                    "contradictions": [],
                    "implications": [],
                    "memorable_quotes": [],
                    "speaker_identity": "Unknown",
                    "source_context": "Restricted or Private Source"
                }
            }
    else:
        # If segments exist but are very short, we might still want to mark as rescued or thin
        transcript_text = "\n\n".join(
            [f"[{c.get('start', 0)}s]: {c.get('text', '')}" for c in segments]
        )
        if len(transcript_text.split()) < 30:
            is_rescued = True # Treat very thin transcripts as rescued context

    print(json.dumps({"type": "status", "text": "Analyzing context and speaker signals..."}), flush=True)
    
    safe_lang = (lang or "en").strip()
    
    if is_rescued:
        system_prompt = f"""
        You are the Strategic Analyst. This source is restricted (no audio, only official context).
        Your task is to infer the core strategic thesis and primary arguments 
        based on the official source metadata and description.
        
        CRITICAL RULES:
        1. STRICT GROUNDING: Only use facts from the provided text. Do NOT use prior knowledge of people, companies, or tech founders (including names like Karri Saarinen or Linear) unless they are in the text.
        2. NO FIELD LEAKAGE: Do NOT include field names like 'source_context', 'contradictions', or 'frameworks' in your text output.
        3. Identify the strategic pillars and intended audience impact.
        4. Capture controversies, tensions, or competitive positioning inherent in the subject.
        5. If no verbatim quotes are present, leave the quotes array empty.
        6. Frame the entire extraction as a "Context-Inferred Strategic Intelligence" report.
        CRITICAL: You MUST write your response entirely in the '{safe_lang}' language.
        """
    else:
        system_prompt = f"""
        You are the Strategic Insight Extractor—a research lead for a premium executive publication.
        Your task is to extract dense, actionable, and analytical intelligence from this source material.
        
        CRITICAL RULES:
        1. STRICT GROUNDING: Use ONLY the provided transcript. Do NOT invent claims or use prior knowledge of the speaker's other work or famous tech companies unless mentioned.
        2. NO FIELD LEAKAGE: Internal model names (e.g., 'source_context', 'key_claims', 'implications') must NEVER appear in the text values you provide.
        3. Identify frameworks, metrics, and step-by-step models explicitly stated.
        4. Perform deep analysis: surface controversies, contradictions, and second-order implications.
        5. Extract impactful verbatim quotes where available.
        6. Frame the analysis as "High-Fidelity Strategic Intelligence."
        CRITICAL: You MUST write your response entirely in the '{safe_lang}' language.
        """
    
    try:
        print(json.dumps({"type": "status", "text": "Extracting core arguments and frameworks..."}), flush=True)
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Extract insights from this transcript:\n\n{transcript_text[:90000]}"}
            ],
            response_format=InsightExtraction,
        )
        
        print(json.dumps({"type": "status", "text": "Finalizing synthesis and mapping implications..."}), flush=True)
        extracted_data = completion.choices[0].message.parsed
        
        out_dir = get_safe_tmp_dir("insights")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source_id}_insights.json")
        
        bundle = {
            "status": "success",
            "source_id": source_id,
            "is_rescued": is_rescued,
            "data": json.loads(extracted_data.model_dump_json())
        }
        
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, indent=2)
            
        # Cloud Bridge: Mirror success result to Supabase Storage
        try:
            from supabase_utils import upload_artifact
            upload_artifact("insights", source_id, out_path)
        except Exception as e:
            print(f"[{source_id}] Cloud sync skipped: {e}")
            
        return bundle
        
    except Exception as e:
        # HARDENING: If extraction fails, we MUST still write a stub insights file 
        # so downstream stages don't fail with "File not found" errors.
        error_msg = str(e)
        print(f"[{source_id}] Insight extraction failed: {error_msg}", file=sys.stderr)
        
        fail_dir = get_safe_tmp_dir("insights")
        os.makedirs(fail_dir, exist_ok=True)
        fail_path = os.path.join(fail_dir, f"{source_id}_insights.json")
        
        mock_data = {
            "core_argument": f"Analysis Paused: {error_msg}",
            "key_claims": ["Content quality too low or LLM timeout."],
            "supporting_examples": [],
            "frameworks": [],
            "controversies": [],
            "contradictions": [],
            "implications": [],
            "memorable_quotes": [],
            "speaker_identity": "Unknown",
            "source_context": "Failed analysis"
        }
        
        fail_bundle = {
            "status": "failed",
            "source_id": source_id,
            "error": error_msg,
            "data": mock_data
        }
        
        with open(fail_path, 'w', encoding='utf-8') as f:
            json.dump(fail_bundle, f, indent=2)
            
        # Cloud Bridge: Mirror fail result too so UI updates
        try:
            from supabase_utils import upload_artifact
            upload_artifact("insights", source_id, fail_path)
        except Exception: pass
            
        return fail_bundle


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract structured knowledge from an insight packet.")
    parser.add_argument("--input", required=True, help="Path to input packet JSON.")
    
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    try:
        res = extract_insights(args.input, args.lang)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)
