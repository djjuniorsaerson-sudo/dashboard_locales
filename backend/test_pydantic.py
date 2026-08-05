import sys
sys.path.append('.')
from app.api.v1.yummy import YummyInstallCreate

try:
    data = {
        'local_id': 'test_id',
        'local_name': 'Local Principal',
        'base_url': 'http://100.93.127.63:8080',
        'api_key': 'secreto123',
        'sync_mode': 'manual',
        'program_type': 'yummy'
    }
    obj = YummyInstallCreate(**data)
    print("Success:", obj)
except Exception as e:
    print("Error:", e)