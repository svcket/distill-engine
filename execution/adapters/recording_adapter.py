"""
Recording source adapter.
Handles audio blobs captured via the browser MediaRecorder.
"""

import os
import hashlib
import time
from .base_adapter import BaseAdapter, NormalizedSource


class RecordingAdapter(BaseAdapter):

    def detect(self, url: str) -> bool:
        """Detects recording:// URIs."""
        return url.startswith("recording://")

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        # Strip recording:// prefix
        file_path = url.replace("recording://", "")
        
        # Generate stable source_id from path or timestamp
        source_id = "rec_" + hashlib.md5(file_path.encode()).hexdigest()[:12]
        
        # Inferred metadata for MVP
        timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S")
        title = f"Voice Recording - {timestamp_str}"

        # Get actual file metadata if possible
        file_size = 0
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)

        return NormalizedSource(
            source_id=source_id,
            source_type="recording",
            title=title,
            creator="User Recording",
            url=file_path,
            duration_seconds=0, # Will be determined during processing
            description=f"Audio recording captured on {timestamp_str}",
            transcript_status="pending_whisper",
            language="en",
            source_confidence=1.0, # User manually recorded this
            raw_metadata={
                "file_path": file_path,
                "file_size": file_size,
                "captured_at": timestamp_str
            }
        )
