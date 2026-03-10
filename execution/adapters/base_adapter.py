"""
Base adapter interface for Distill's multi-source ingestion system.
All source adapters must implement this interface and output the
normalized source schema consumed by the rest of the pipeline.
"""

import os
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from typing import Optional
from datetime import datetime


@dataclass
class NormalizedSource:
    """The canonical source object consumed by every downstream pipeline stage."""
    source_id: str               # Unique stable identifier (video_id, slug, hash)
    source_type: str             # youtube | vimeo | podcast | upload
    title: str
    creator: str                 # Channel name, podcast host, author
    url: str
    published_at: Optional[str] = None   # ISO 8601
    duration_seconds: int = 0
    description: str = ""
    transcript_status: str = "unknown"   # available | unavailable | unknown | manual
    language: str = "en"
    thumbnail: Optional[str] = None
    source_confidence: float = 1.0       # 0.0–1.0; lower for auto-detected stubs
    raw_metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    def to_legacy_dict(self) -> dict:
        """Backwards-compatible dict for scripts that still use video_id keys."""
        return {
            "video_id": self.source_id,
            "source_id": self.source_id,
            "source_type": self.source_type,
            "title": self.title,
            "channel": self.creator,
            "creator": self.creator,
            "url": self.url,
            "published_at": self.published_at,
            "duration": self._seconds_to_iso(self.duration_seconds),
            "duration_seconds": self.duration_seconds,
            "description": self.description,
            "transcript_status": self.transcript_status,
            "language": self.language,
            "thumbnail": self.thumbnail,
            "source_confidence": self.source_confidence,
        }

    def _seconds_to_iso(self, seconds: int) -> str:
        """Convert seconds to ISO 8601 duration string (PT1H2M3S)."""
        if not seconds:
            return "PT0S"
        h, remainder = divmod(seconds, 3600)
        m, s = divmod(remainder, 60)
        parts = "PT"
        if h: parts += f"{h}H"
        if m: parts += f"{m}M"
        if s: parts += f"{s}S"
        return parts if len(parts) > 2 else "PT0S"


class BaseAdapter(ABC):
    """
    Abstract adapter interface. Each source type implements this.
    """

    @abstractmethod
    def detect(self, url: str) -> bool:
        """Return True if this adapter can handle the given URL/identifier."""
        pass

    @abstractmethod
    def normalize(self, url: str) -> NormalizedSource:
        """
        Parse the URL, extract metadata, and return a NormalizedSource.
        Must not raise — should return a best-effort NormalizedSource on failure.
        """
        pass

    def save(self, source: NormalizedSource, base_dir: str) -> str:
        """
        Persist the normalized source to disk as a JSON file.
        Returns the path to the saved file.
        """
        out_dir = os.path.join(base_dir, ".tmp", "sources")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{source.source_id}.json")

        # Also write legacy list format for backwards compatibility
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump([source.to_legacy_dict()], f, indent=2)

        return out_path
