#!/bin/bash

# Distill Auditor & CI Pre-flight
# This script ensures the codebase satisfies CI checks before pushing.

# Color constants
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "------------------------------------------------"
echo " DISTILL PRE-FLIGHT AUDITOR"
echo "------------------------------------------------"

# 1. Environment Check
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
if [ ! -d "web" ] || [ ! -d "execution" ]; then
    echo -e "${RED}[!] Error: Run this from the project root.${NC}"
    exit 1
fi

# Load variables if exist
if [ -f web/.env.local ]; then
  export $(grep -v '^#' web/.env.local | xargs)
fi

# 2. Web Checks
echo -e "\n[*] Running Web Checks (Build & Type Check)..."
(cd web && npm run build --no-lint)
WEB_STATUS=$?

if [ $WEB_STATUS -eq 0 ]; then
    echo -e "${GREEN}[OK] Web checks passed.${NC}"
else
    echo -e "${RED}[FAIL] Web checks failed.${NC}"
fi

# 3. Python Checks
echo -e "\n[*] Running Python Checks (Unit Tests)..."
python3 -m pytest tests/ --ignore=execution/tests/integration/
PYTEST_STATUS=$?

if [ $PYTEST_STATUS -eq 0 ]; then
    echo -e "${GREEN}[OK] Python tests passed.${NC}"
else
    echo -e "${RED}[FAIL] Python tests failed.${NC}"
fi

# 4. AI Strategic Audit (Optional)
if [ -n "$OPENAI_API_KEY" ]; then
    echo -e "\n[*] Running AI Strategic Audit..."
    python3 execution/distill_auditor.py --staged
    AUDIT_STATUS=$?
else
    echo -e "\n[!] Skipping AI Audit (OPENAI_API_KEY not set)."
    AUDIT_STATUS=0
fi

# Final Verdict
echo -e "\n------------------------------------------------"
if [ $WEB_STATUS -eq 0 ] && [ $PYTEST_STATUS -eq 0 ] && [ $AUDIT_STATUS -eq 0 ]; then
    echo -e "${GREEN} VERDICT: GO - CODE IS READY FOR PUSH${NC}"
    exit 0
else
    echo -e "${RED} VERDICT: NO-GO - FIX ERRORS BEFORE PUSH${NC}"
    exit 1
fi
echo "------------------------------------------------"
