import os
import tempfile
import pathlib

def get_safe_tmp_dir(sub_dir=""):
    """
    Returns a writable temporary directory.
    Respects DISTILL_TMP_DIR env var, fallbacks to /tmp on Linux/Mac if VERCEL is detected.
    """
    base_dir = os.environ.get("DISTILL_TMP_DIR")
    
    if not base_dir:
        # Detected Vercel or production environment
        if os.environ.get("VERCEL") == "1" or os.environ.get("NEXT_PUBLIC_VERCEL_URL"):
            base_dir = "/tmp"
        else:
            # Local development fallback
            base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "execution", ".tmp")
    
    target_dir = os.path.join(base_dir, sub_dir) if sub_dir else base_dir
    
    # Ensure exists
    os.makedirs(target_dir, exist_ok=True)
    
    return target_dir

def get_safe_tmp_path(file_name, sub_dir=""):
    """Returns a safe path for a file in the temporary directory."""
    return os.path.join(get_safe_tmp_dir(sub_dir), file_name)
