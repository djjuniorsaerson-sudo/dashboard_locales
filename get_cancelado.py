import re
with open(r'G:\Softwares Juniors 2026\proyecto - Yummy VPS Ready\backend\api\routes.py','r',encoding='utf-8') as f:
    content = f.read()

matches = re.findall(r'.{0,50}Cancelado.{0,50}', content, re.IGNORECASE)
for m in matches:
    print(m)
