from .base_adapter import BaseAdapter, NormalizedSource
from .youtube_adapter import YouTubeAdapter
from .vimeo_adapter import VimeoAdapter
from .podcast_adapter import PodcastAdapter
from .upload_adapter import UploadAdapter
from .adapter_router import route_source, ingest

__all__ = [
    "BaseAdapter", "NormalizedSource",
    "YouTubeAdapter", "VimeoAdapter", "PodcastAdapter", "UploadAdapter",
    "route_source", "ingest",
]
