from fs_utils import get_safe_tmp_dir, get_safe_tmp_path
import os
import tempfile
import sys

def get_safe_tmp_dir(subdir: str = None) -> str:
    """
    Returns a writable directory path.
    Prioritizes system /tmp for production environments (Vercel/Railway).
    """
    # Use environment variable if set, otherwise fallback to system tmp
    base_dir = os.environ.get("DISTILL_TMP_DIR")
    
    if not base_dir:
        if os.path.exists('/tmp'):
            base_dir = '/tmp'
        else:
            # Local fallback for extreme cases
            base_dir = get_safe_tmp_dir()

    if subdir:
        target = os.path.join(base_dir, subdir)
        os.makedirs(target, exist_ok=True)
        return target
        
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def get_safe_tmp_path(filename: str, subdir: str = None) -> str:
    """
    Returns a full path to a file in the safe tmp directory.
    """
    return os.path.join(get_safe_tmp_dir(subdir), filename)
