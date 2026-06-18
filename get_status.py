import re
with open(r'G:\Softwares Juniors 2026\proyecto - Yummy VPS Ready\backend\api\routes.py','r',encoding='utf-8') as f:
    content = f.read()

match = re.search(r'@api\.put\("/pedidos/<int:order_id>/status"\).*?(?=\n\n@)', content, re.DOTALL)
if match:
    print(match.group(0))
