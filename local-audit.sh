#!/bin/bash

# Distill Auditor Helper
# Runs the local LLM code review engine

# Ensure we are in the root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load environment variables if .env.local exists (Next.js standard)
if [ -f web/.env.local ]; then
  export $(grep -v '^#' web/.env.local | xargs)
fi

# Fallback for execution/.env
if [ -f execution/.env ]; then
  export $(grep -v '^#' execution/.env | xargs)
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OPENAI_API_KEY is not set. Please add it to web/.env.local or your environment."
  exit 1
fi

echo "[*] Initializing Distill Auditor..."

# Pass all arguments to the python script
python3 execution/distill_auditor.py "$@"
