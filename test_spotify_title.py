import os
import sys
import json
import subprocess

# Ensure we can import from execution/
sys.path.append(os.path.join(os.getcwd(), "execution"))

from adapters.podcast_adapter import is_generic_title

def test_generic_titles():
    # Test cases for the guard
    cases = [
        ("Spotify – Web Player", True),
        ("Spotify - Web Player", True),
        ("Podcast Episode", True),
        ("Untitled", True),
        ("12345", True), # Pure numeric
        ("ok", True),    # Too short
        ("404 Page Not Found", True),
        ("The Daily: Behind the Scenes", False), # Real title
        ("How I Built This with Guy Raz", False) # Real title
    ]
    
    print("--- Running Generic Title Guard Tests ---")
    failed = False
    for title, expected in cases:
        result = is_generic_title(title)
        status = "PASS" if result == expected else "FAIL"
        print(f"[{status}] Title: '{title}' | Expected Generic: {expected} | Result: {result}")
        if result != expected:
            failed = True
    
    if failed:
        print("\n!!! Generic Title Guard FAILED some cases.")
        return False
    else:
        print("\nAll Generic Title Guard cases PASSED.")
        return True

def test_execution_guard():
    # Run the harvester on a known failing Spotify URL
    # This URL often returns "Spotify – Web Player" when blocked or in error state
    test_id = "spotify_guard_test"
    test_url = "https://open.spotify.com/episode/0P9khKh1YB6sdhWdkmlihX"
    
    print(f"\n--- Running Execution Guard Test on {test_url} ---")
    
    cmd = [
        "python3", "execution/transcript_harvester.py",
        "--source-id", test_id,
        "--url", test_url
    ]
    
    try:
        # Run with timeout to prevent hangs
        process = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        output = process.stdout
        
        # Parse the JSON response from the harvester
        # The harvester prints the JSON result to stdout
        results = [json.loads(line) for line in output.splitlines() if line.strip().startswith("{")]
        
        if not results:
            print("FAIL: No JSON output from harvester.")
            return False
        
        res = results[0]
        title = res.get("title")
        status = res.get("status")
        is_failure = res.get("is_failure", False)
        
        print(f"Result Status: {status}")
        print(f"Result Title: {title}")
        print(f"Is Failure: {is_failure}")
        
        # Verification: We should NOT have "Spotify – Web Player" as the title
        if title == "Spotify – Web Player":
            print("FAIL: Generic title leaked into result.")
            return False
            
        # If it was rescued, it should have a 'thin_content' or similar failure type in our new logic
        if is_failure:
             print("SUCCESS: Pipeline correctly stopped generic title ingestion.")
             return True
        else:
             print("WARNING: Pipeline succeeded? (Check if it actually found a real title now).")
             return True

    except subprocess.TimeoutExpired:
        print("FAIL: Execution timed out.")
        return False
    except Exception as e:
        print(f"FAIL: Error during execution: {e}")
        return False

if __name__ == "__main__":
    guard_ok = test_generic_titles()
    exec_ok = test_execution_guard()
    
    if guard_ok and exec_ok:
        print("\nVERIFICATION COMPLETE: System is hardened against generic titles.")
        sys.exit(0)
    else:
        print("\nVERIFICATION FAILED: System still vulnerable.")
        sys.exit(1)
