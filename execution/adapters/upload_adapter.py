"""
Upload source adapter.
Handles locally uploaded audio/video files.
Generates source_id from filename hash.
Transcript via Whisper API.
"""

import os
import re
import hashlib
from .base_adapter import BaseAdapter, NormalizedSource


SUPPORTED_EXTENSIONS = {".mp4", ".mp3", ".m4a", ".wav", ".mov", ".mkv", ".webm", ".ogg", ".flac"}


class UploadAdapter(BaseAdapter):

    def detect(self, url: str) -> bool:
        """Detects local file paths or upload:// URIs."""
        if url.startswith("upload://"):
            return True
        ext = os.path.splitext(url.lower())[1]
        return ext in SUPPORTED_EXTENSIONS

    def normalize(self, url: str, shell: bool = False) -> NormalizedSource:
        # Strip upload:// prefix if present
        file_path = url.replace("upload://", "")
        filename = os.path.basename(file_path)
        name_without_ext = os.path.splitext(filename)[0]

        source_id = "upload_" + hashlib.md5(file_path.encode()).hexdigest()[:12]

        # Try to get actual file metadata
        duration_seconds = 0
        file_size = 0
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)

        return NormalizedSource(
            source_id=source_id,
            source_type="upload",
            title=self._humanize(name_without_ext),
            creator="Uploaded File",
            url=file_path,
            duration_seconds=duration_seconds,
            description=f"Uploaded file: {filename} ({self._fmt_size(file_size)})",
            transcript_status="pending_whisper",
            language="en",
            source_confidence=0.95,  # High confidence — user explicitly uploaded it
            raw_metadata={
                "filename": filename,
                "file_path": file_path,
                "file_size": file_size,
            }
        )

    def _humanize(self, name: str) -> str:
        """Convert filename to readable title: my_podcast_ep-01 → My Podcast Ep 01"""
        name = re.sub(r"[-_]", " ", name)
        return name.strip().title()

    def _fmt_size(self, size: int) -> str:
        if size > 1_000_000:
            return f"{size / 1_000_000:.1f} MB"
        elif size > 1_000:
            return f"{size / 1_000:.0f} KB"
        return f"{size} B"
