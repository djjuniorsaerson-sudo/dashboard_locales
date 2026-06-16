import os
import glob
import re

frontend_dir = 'frontend/src'
files = glob.glob(frontend_dir + '/**/*.jsx', recursive=True) + glob.glob(frontend_dir + '/**/*.js', recursive=True)

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    def replacer(match):
        path = match.group(2)
        # return string with backticks
        return f'`http://${{window.location.hostname}}:8000{path}`'

    # Match 'http://localhost:8000/any/path' or "http://localhost:8000/any/path"
    new_content = re.sub(r'([\'"])http://localhost:8000([^\'"]*)\1', replacer, content)
    
    if content != new_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('Updated', filepath)
