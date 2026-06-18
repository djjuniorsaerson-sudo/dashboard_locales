import re
with open(r'G:\Softwares Juniors 2026\proyecto - Yummy VPS Ready\backend\api\routes.py','r',encoding='utf-8') as f:
    content = f.read()

print("Anulado count:", len(re.findall(r'Anulado', content, re.IGNORECASE)))
print("Cancelado count:", len(re.findall(r'Cancelado', content, re.IGNORECASE)))
