import json, subprocess

def get_eslint_errors():
    res = subprocess.run(["npx", "eslint", "src/", "--format", "json"], capture_output=True, text=True)
    try:
        return json.loads(res.stdout)
    except Exception:
        return []

for file_err in get_eslint_errors():
    if not file_err.get('messages'):
        continue
    
    filepath = file_err['filePath']
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    changed = False
    for msg in file_err['messages']:
        if msg['ruleId'] == '@typescript-eslint/no-explicit-any':
            line_idx = msg['line'] - 1
            old_line = lines[line_idx]
            
            new_line = old_line.replace('catch (err: any)', 'catch (err: unknown)')
            new_line = new_line.replace('catch (error: any)', 'catch (error: unknown)')
            new_line = new_line.replace(': any,', ': unknown,')
            new_line = new_line.replace(': any)', ': unknown)')
            new_line = new_line.replace(': any ', ': unknown ')
            new_line = new_line.replace('<any>', '<unknown>')
            new_line = new_line.replace('as any', 'as unknown')
            new_line = new_line.replace(': any=', ': unknown=')
            new_line = new_line.replace(': any =', ': unknown =')
            
            if new_line != old_line:
                lines[line_idx] = new_line
                changed = True
                print(f"Fixed 'any' in {filepath}:{msg['line']}")

    if changed:
        with open(filepath, 'w') as f:
            f.writelines(lines)

