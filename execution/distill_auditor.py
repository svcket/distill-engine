import os
import sys
import subprocess
import json
import argparse
from typing import Optional
from openai import OpenAI

# ─── Configuration & Personas ────────────────────────────────────────────────

AUDITOR_SYSTEM_PROMPT = """
You are the Distill Code Auditor—a high-fidelity AI security engineer and system architect.
Your mission is to perform a rigorous review of code changes (git diffs) provided by the user.

STRICT REVIEW CRITERIA:
1. SECURITY: Look for auth bypasses, hardcoded secrets, prompt injection, sanitization failures, and fail-open logic.
2. LOGIC: Identify edge cases, race conditions, incorrect state handling, and pipeline stalls.
3. PERFORMANCE: Flag redundant API calls, large memory allocations, and blocking I/O in async contexts.
4. BRAND STANDARDS: Ensure compliance with the 'Distill' aesthetic
    (premium, high-fidelity) and engineering standards (Agency Layer 3).

REPORT FORMAT:
Summary: A concise 1-2 sentence overview of the change.
Findings:
  - CRITICAL: Blocking issues that must be fixed before merge.
  - MAJOR: Significant logic or security improvements.
  - MINOR: Hygiene, styling, and technical debt.

Tone should be authoritative, professional, and slightly mechanical.
"""

# ─── Git Integration ─────────────────────────────────────────────────────────

def get_git_diff(compare_with: Optional[str] = None, staged: bool = False) -> str:
    """Extract git diff for analysis."""
    cmd = ["git", "diff"]
    if staged:
        cmd.append("--cached")
    if compare_with:
        cmd.append(compare_with)
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error: Git diff failed (Exit {e.returncode}):\n{e.stderr}", file=sys.stderr)
        return None

# ─── Analysis Engine ──────────────────────────────────────────────────────────

def analyze_diff(diff_text: str, project_hint: str = "general") -> Optional[str]:
    """Send diff to OpenAI for analysis."""
    if not diff_text.strip():
        return "No changes detected in Git diff."

    if "OPENAI_API_KEY" not in os.environ:
        raise RuntimeError("OPENAI_API_KEY not found in environment.")

    client = OpenAI()
    
    # Cap diff size to avoid token overflow (approx 100k tokens safety)
    if len(diff_text) > 400000:
        diff_text = diff_text[:400000] + "\n\n[TRUNCATED: DIFF TOO LARGE]"

    messages = [
        {"role": "system", "content": AUDITOR_SYSTEM_PROMPT},
        {"role": "user", "content": f"AUDIT REQUEST (Project: {project_hint})\n\nGIT DIFF:\n```diff\n{diff_text}\n```"}
    ]

    try:
        print(f"[*] Analyzing diff ({len(diff_text)} bytes)...", file=sys.stderr)
        completion = client.chat.completions.create(
            model="gpt-4o", # Use GPT-4o for high-fidelity reasoning
            messages=messages,
            temperature=0.1 # Low temperature for consistent auditing
        )
        return completion.choices[0].message.content
    except Exception as e:
        raise RuntimeError(f"Audit Error: {str(e)}") from e

# ─── Main Interface ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Distill Code Auditor: Local CodeRabbit Alternative")
    parser.add_argument("--staged", action="store_true", help="Review staged changes only.")
    parser.add_argument("--base", help="Compare current HEAD with a base branch (e.g. main/develop).")
    parser.add_argument("--project", default="Distill Engine", help="Project context hint.")
    parser.add_argument("--output", help="Save report to a specific file.")
    
    args = parser.parse_args()

    # 1. Capture Changes
    diff = get_git_diff(compare_with=args.base, staged=args.staged)
    
    if diff is None:
        sys.exit(1)
    if not diff:
        print("No changes found to audit.")
        sys.exit(0)

    # 2. Run Audit
    try:
        report = analyze_diff(diff, project_hint=args.project)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    # 3. Handle Output
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"[*] Audit complete. Report saved to {args.output}")
    else:
        print("\n" + "="*80)
        print(" DISTILL CODE AUDIT REPORT")
        print("="*80 + "\n")
        print(report)
        print("\n" + "="*80)

if __name__ == "__main__":
    main()
