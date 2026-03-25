import sys
import os
import json

# Add parent directory to path to import adapters
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters.adapter_router import route_source

def test_twitter():
    url = "https://x.com/jack/status/20"
    print(f"Testing Twitter URL: {url}")
    source = route_source(url)
    print(f"Detected Type: {source.source_type}")
    assert source.source_type == "twitter"
    print("Twitter test passed!\n")

def test_pdf():
    url = "upload://research_paper.pdf"
    print(f"Testing PDF URL: {url}")
    source = route_source(url)
    print(f"Detected Type: {source.source_type}")
    assert source.source_type == "document"
    print("PDF test passed!\n")

def test_docx():
    url = "upload://contract.docx"
    print(f"Testing DOCX URL: {url}")
    source = route_source(url)
    print(f"Detected Type: {source.source_type}")
    assert source.source_type == "document"
    print("DOCX test passed!\n")

if __name__ == "__main__":
    try:
        test_twitter()
        test_pdf()
        test_docx()
        print("ALL ADAPTER TESTS PASSED!")
    except Exception as e:
        print(f"TEST FAILED: {e}")
        sys.exit(1)
