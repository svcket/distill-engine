import json
import subprocess
import os

def get_eslint_errors():
    """Fetch current ESLint errors in JSON format."""
    res = subprocess.run(["npx", "eslint", "src/", "--format", "json"], capture_output=True, text=True)
    try:
        return json.loads(res.stdout)
    except Exception:
        return []

def main():
    errors = get_eslint_errors()
    if not errors:
        print("No ESLint errors found.")
        return

    manual_review_needed = []
    
    for file_err in errors:
        filepath = file_err.get('filePath')
        messages = file_err.get('messages', [])
        
        if not filepath or not messages:
            continue
            
        if not os.path.exists(filepath):
            continue

        with open(filepath, 'r') as f:
            lines = f.readlines()
            
        changed = False
        for msg in messages:
            if msg.get('ruleId') == '@typescript-eslint/no-explicit-any':
                line_number = msg.get('line')
                if not line_number:
                    continue
                    
                line_idx = line_number - 1
                
                # Bounds check to prevent IndexError
                if line_idx < 0 or line_idx >= len(lines):
                    continue
                    
                old_line = lines[line_idx]
                
                # 1. SAFE REPLACEMENTS: Contexts where 'any' is purely used as a catch-all type
                new_line = old_line.replace('catch (err: any)', 'catch (err: unknown)')
                new_line = new_line.replace('catch (error: any)', 'catch (error: unknown)')
                new_line = new_line.replace(': any,', ': unknown,')
                new_line = new_line.replace(': any)', ': unknown)')
                new_line = new_line.replace(': any ', ': unknown ')
                new_line = new_line.replace('<any>', '<unknown>')
                new_line = new_line.replace(': any=', ': unknown=')
                new_line = new_line.replace(': any =', ': unknown =')
                
                # 2. RISKY REPLACEMENTS: Casts like 'as any' often mask runtime logic.
                # Report these for manual review instead of auto-fixing.
                if 'as any' in old_line:
                    manual_review_needed.append(f"{filepath}:{line_number} -> Detected 'as any' cast")
                
                if new_line != old_line:
                    lines[line_idx] = new_line
                    changed = True
                    print(f"Fixed safe 'any' usage in {os.path.basename(filepath)}:{line_number}")

        if changed:
            with open(filepath, 'w') as f:
                f.writelines(lines)

    # Output Summary of Risky Findings
    if manual_review_needed:
        print("\n" + "="*50)
        print("MANUAL REVIEW REQUIRED (Risky 'as any' casts)")
        print("="*50)
        for report in manual_review_needed:
            print(f"- {report}")
        print("="*50 + "\n")

if __name__ == "__main__":
    main()
