import re, json, subprocess

def get_eslint_errors():
    res = subprocess.run(["npx", "eslint", "src/", "--format", "json"], capture_output=True, text=True)
    try:
        return json.loads(res.stdout)
    except:
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
            # Print to see it
            print(f"{filepath}:{msg['line']} {old_line.strip()}")
            
            # Simple replacements
            if 'catch (err: any)' in old_line:
                lines[line_idx] = old_line.replace('catch (err: any)', 'catch (err: unknown)')
                changed = True
            elif 'catch (error: any)' in old_line:
                lines[line_idx] = old_line.replace('catch (error: any)', 'catch (error: unknown)')
                changed = True
            elif ': any,' in old_line:
                lines[line_idx] = old_line.replace(': any,', ': unknown,')
                changed = True
            elif ': any)' in old_line:
                lines[line_idx] = old_line.replace(': any)', ': unknown)')
                changed = True
            elif ': any ' in old_line:
                lines[line_idx] = old_line.replace(': any ', ': unknown ')
                changed = True
            elif '<any>' in old_line:
                lines[line_idx] = old_line.replace('<any>', '<unknown>')
                changed = True
            elif 'as any' in old_line:
                lines[line_idx] = old_line.replace('as any', 'as unknown')
                changed = True
            elif ': any=' in old_line or ': any =' in old_line:
                lines[line_idx] = old_line.replace(': any', ': unknown')
                changed = True

    if changed:
        with open(filepath, 'w') as f:
            f.writelines(lines)

