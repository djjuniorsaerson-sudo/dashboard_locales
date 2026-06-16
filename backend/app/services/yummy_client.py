import requests

class YummyIntegrationClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            "X-Integration-Key": self.api_key,
            "Content-Type": "application/json"
        }

    def check_health(self):
        url = f"{self.base_url}/api/integration/health"
        response = requests.get(url, headers=self.headers, timeout=5)
        response.raise_for_status()
        return response.json()

    def get_status(self):
        url = f"{self.base_url}/api/integration/status"
        response = requests.get(url, headers=self.headers, timeout=5)
        response.raise_for_status()
        return response.json()

    def get_export(self):
        url = f"{self.base_url}/api/integration/export"
        response = requests.get(url, headers=self.headers, timeout=10)
        response.raise_for_status()
        return response.json()

    def get_events(self):
        url = f"{self.base_url}/api/integration/events"
        response = requests.get(url, headers=self.headers, timeout=5)
        response.raise_for_status()
        return response.json()

    def send_command(self, payload: dict):
        url = f"{self.base_url}/api/integration/commands"
        response = requests.post(url, json=payload, headers=self.headers, timeout=5)
        response.raise_for_status()
        return response.json()

    def get_audit(self):
        url = f"{self.base_url}/api/integration/audit"
        response = requests.get(url, headers=self.headers, timeout=5)
        response.raise_for_status()
        return response.json()
