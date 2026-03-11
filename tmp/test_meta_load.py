import sys
import os
import json
import glob

# Add execution directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "execution")))

from transcript_harvester import load_source_metadata

source_id = "podcast_edaa12527029"
print(f"Testing load_source_metadata for: {source_id}")

metadata = load_source_metadata(source_id)
print(f"Result: {json.dumps(metadata, indent=2)}")

# Check file existence manually
base = "execution"
path = os.path.join(base, ".tmp", "sources", "*.json")
files = glob.glob(path)
print(f"Discovery files found in {path}: {files}")
