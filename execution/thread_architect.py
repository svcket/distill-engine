import os
import sys
import json
import logging
import argparse
from typing import List, Dict, Any, Optional
from openai import OpenAI
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class XThread(BaseModel):
    hook: str
    thread: List[str]
    cta: str

class ThreadArchitect:
    def __init__(self, api_key: Optional[str] = None):
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        
        # Load directive with multiple fallback paths
        base_dir = os.path.dirname(__file__)
        candidate_paths = [
            os.path.join(base_dir, "../directives/x_thread_architect.md"),
            os.path.join(base_dir, "directives/x_thread_architect.md"),
            os.path.join(os.getcwd(), "directives/x_thread_architect.md")
        ]
        
        self.system_prompt = None
        for path in candidate_paths:
            if os.path.exists(path):
                with open(path, "r") as f:
                    self.system_prompt = f.read()
                break
        
        if not self.system_prompt:
            logger.warning("Directive file x_thread_architect.md not found. Using default internal prompt.")
            self.system_prompt = (
                "You are a world-class social strategist. Generate a "
                "high-performance X thread from the provided content. "
                "Return ONLY JSON."
            )

    def generate_thread(
        self, 
        draft_content: str, 
        transcript_summary: str, 
        source_url: Optional[str] = None, 
        lang: str = "en"
    ) -> Dict[str, Any]:
        logger.info("Generating X Thread from draft and transcript context...")
        
        user_prompt = f"""Draft Content:
{draft_content}

Transcript Summary/Context:
{transcript_summary}

Source URL (for CTA): {source_url or "None"}

Transform the above into a high-performance X thread following our directives. 
Return ONLY the JSON structure."""

        # Sanitize language
        safe_lang = (lang or "en").strip()
        if len(safe_lang) > 10 or not all(c.isalnum() or c in '-' for c in safe_lang):
            safe_lang = "en"

        try:
            system_msg = self.system_prompt + f"\nCRITICAL: You MUST write your response entirely in the '{safe_lang}' language."
            response = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_prompt}
                ],
                response_format=XThread
            )
            
            result = response.choices[0].message.parsed
            return result.model_dump()
            
        except Exception as e:
            logger.error(f"Error generating thread: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "hook": "Error generating thread hook.",
                "thread": [],
                "cta": "Check back later."
            }

def main():
    parser = argparse.ArgumentParser(description="Generate X Thread from Draft and Transcript")
    parser.add_argument("--draft", required=True, help="Path to draft content file or raw content")
    parser.add_argument("--transcript", required=True, help="Path to transcript summary or raw content")
    parser.add_argument("--url", help="Original source URL")
    parser.add_argument("--output", help="Output JSON file path")
    
    parser.add_argument("--lang", default="en", help="Language code")
    args = parser.parse_args()
    # Load content
    if os.path.exists(args.draft):
        with open(args.draft, "r") as f:
            draft_content = f.read()
    else:
        draft_content = args.draft
        
    if os.path.exists(args.transcript):
        with open(args.transcript, "r") as f:
            transcript_content = f.read()
    else:
        transcript_content = args.transcript
        
    architect = ThreadArchitect()
    thread_data = architect.generate_thread(draft_content, transcript_content, args.url, args.lang)
    
    if args.output:
        with open(args.output, "w") as f:
            json.dump(thread_data, f, indent=2)
    
    # Always print as fallback for the runner to capture
    print(json.dumps(thread_data))
    
    if thread_data.get("status") == "failed":
        sys.exit(1)

if __name__ == "__main__":
    main()
