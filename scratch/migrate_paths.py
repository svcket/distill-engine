import os
import re

execution_dir = "execution"
files_to_migrate = [f for f in os.listdir(execution_dir) if f.endswith(".py")]

patterns = [
    # os.path.join(base, ".tmp", "folder") -> get_safe_tmp_dir("folder")
    (r'os\.path\.join\([^,]+, "\.tmp", "([^"]+)"\)', r'get_safe_tmp_dir("\1")'),
    # os.path.join(base, ".tmp", folder) -> get_safe_tmp_dir(folder)
    (r'os\.path\.join\([^,]+, "\.tmp", ([^,)]+)\)', r'get_safe_tmp_dir(\1)'),
    # os.path.join(os.path.dirname(__file__), ".tmp", "folder") -> get_safe_tmp_dir("folder")
    (r'os\.path\.join\(os\.path\.dirname\(__file__\), "\.tmp", "([^"]+)"\)', r'get_safe_tmp_dir("\1")'),
    # os.path.join(base, ".tmp", "folder", sid, filename) -> get_safe_tmp_path(filename, f"folder/{sid}")
    (r'os\.path\.join\([^,]+, "\.tmp", "([^"]+)", ([^,]+), ([^,)]+)\)', r'get_safe_tmp_path(\3, f"\1/{\2}")'),
    # Generic .tmp folder in join
    (r'os\.path\.join\([^,]+, "\.tmp"\)', r'get_safe_tmp_dir()')
]

for filename in files_to_migrate:
    path = os.path.join(execution_dir, filename)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for pattern, replacement in patterns:
        new_content = re.sub(pattern, replacement, new_content)
    
    if new_content != content:
        # Final safety check: if we started from 'execution', check for fs_utils imports
        if "from fs_utils import" not in new_content:
            new_content = "from fs_utils import get_safe_tmp_dir, get_safe_tmp_path\n" + new_content
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Migrated: {filename}")
