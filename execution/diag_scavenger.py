import os
import sys
import json

# Ensure local imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("--- SCAVENGER HUB DIAGNOSTICS ---")
print(f"Working Directory: {os.getcwd()}")
print(f"System Path: {sys.path[:5]}...")

# 1. Check for API Token
token = os.environ.get("APIFY_TOKEN")
if token:
    masked_token = f"{token[:10]}...{token[-4:]}"
    print(f"APIFY_TOKEN: FOUND ({masked_token})")
else:
    print("APIFY_TOKEN: NOT FOUND")

# 2. Check for scavenger_hub.py file
hub_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scavenger_hub.py")
if os.path.exists(hub_path):
    print(f"scavenger_hub.py: EXISTS at {hub_path}")
    with open(hub_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        print(f"scavenger_hub.py: Total Lines: {len(lines)}")
        
    # Check for target function
    found_func = any("def trigger_scavenger_rescue" in line for line in lines)
    print(f"trigger_scavenger_rescue: {'FOUND' if found_func else 'MISSING'}")
else:
    print("scavenger_hub.py: NOT FOUND in execution/")

# 3. Test Import
try:
    from scavenger_hub import trigger_scavenger_rescue
    print("IMPORT STATUS: SUCCESS (trigger_scavenger_rescue is exportable)")
except Exception as e:
    print(f"IMPORT STATUS: FAILED ({str(e)})")
    
print("--- DIAGNOSTICS COMPLETE ---")
