import re
with open(r'G:\Softwares Juniors 2026\proyecto - Yummy VPS Ready\backend\api\routes.py','r',encoding='utf-8') as f:
    content = f.read()

matches = re.findall(r'@api\.(get|post)\("/sync".*?(?=\n\n@)', content, re.DOTALL)
for m in matches:
    print(m)
