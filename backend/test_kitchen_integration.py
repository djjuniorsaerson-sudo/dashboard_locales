import asyncio
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import requests
from fastapi import FastAPI

from app.api import deps
from app.api.v1 import data


async def send_request(app, method, path, query="", payload=None):
    messages = []
    body = json.dumps(payload).encode() if payload is not None else b""

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    await app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path,
        "raw_path": path.encode(), "query_string": query.encode(),
        "headers": [(b"content-type", b"application/json")],
        "client": ("127.0.0.1", 1234), "server": ("test", 80), "root_path": "",
    }, receive, send)
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return status, json.loads(content)


class KitchenIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(data.router)
        self.db = MagicMock()
        self.installation_id = uuid4()
        self.user = SimpleNamespace(is_active=True, organization_id=uuid4())
        self.install = SimpleNamespace(
            id=self.installation_id, integration_enabled=True,
            connection_status="ONLINE", last_health_check=datetime.now(timezone.utc).replace(tzinfo=None),
            base_url="http://selected-local.invalid", api_key="test-only",
        )
        self.db.query.return_value.filter.return_value.first.return_value = self.install
        self.app.dependency_overrides[deps.get_db] = lambda: self.db
        self.app.dependency_overrides[deps.get_current_user] = lambda: self.user
        self.client_patch = patch.object(data, "YummyIntegrationClient")
        self.client_factory = self.client_patch.start()
        self.addCleanup(self.client_patch.stop)
        self.client = self.client_factory.return_value
        self.client.request.return_value = {"ok": True, "data": {"kitchen1_name": "Pollo"}}

    def request(self, method="GET", path="/cocina/config", query=None, payload=None):
        if query is None:
            query = f"installation_id={self.installation_id}"
        return asyncio.run(send_request(self.app, method, path, query, payload))

    def test_config_uses_selected_installation_and_organization(self):
        status, body = self.request()
        self.assertEqual((status, body), (200, {"kitchen1_name": "Pollo"}))
        conditions = self.db.query.return_value.filter.call_args.args
        self.assertEqual(conditions[0].right.value, self.installation_id)
        self.assertEqual(conditions[1].right.value, self.user.organization_id)
        self.client_factory.assert_called_once_with(self.install.base_url, "test-only")

    def test_missing_or_invalid_installation_never_selects_another_local(self):
        for query in ("", "installation_id=invalid"):
            with self.subTest(query=query):
                self.assertEqual(self.request(query=query)[0], 422)
        self.client_factory.assert_not_called()

    def test_both_routes_require_authentication(self):
        del self.app.dependency_overrides[deps.get_current_user]
        for method, path, payload in (
            ("GET", "/cocina/config", None),
            ("PUT", "/cocina/comandas/7/kitchen2/state", {"state": "done"}),
        ):
            with self.subTest(path=path):
                self.assertEqual(self.request(method, path, payload=payload)[0], 401)
        self.client_factory.assert_not_called()

    def test_unknown_or_foreign_installation_is_rejected(self):
        self.db.query.return_value.filter.return_value.first.return_value = None
        self.assertEqual(self.request()[0], 404)
        self.client_factory.assert_not_called()

    def test_disabled_user_is_rejected(self):
        self.user.is_active = False
        self.assertEqual(self.request()[0], 403)
        self.client_factory.assert_not_called()

    def test_disabled_or_offline_installation_is_rejected(self):
        self.install.integration_enabled = False
        self.assertEqual(self.request()[0], 503)
        self.install.integration_enabled = True
        self.install.connection_status = "REVOKED"
        self.assertEqual(self.request()[0], 503)
        self.client_factory.assert_not_called()

    def test_kitchen_two_action_is_forwarded_once_to_selected_local(self):
        payload = {"state": "done"}
        status, body = self.request("PUT", "/cocina/comandas/7/kitchen2/state", payload=payload)
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.client.request.assert_called_once_with("PUT", "/api/comandas/7/kitchen2/state", payload=payload)

    def test_timeout_is_not_reported_as_success_or_retried(self):
        self.client.request.side_effect = requests.exceptions.Timeout()
        self.assertEqual(self.request("PUT", "/cocina/comandas/7/kitchen2/state", payload={"state": "done"})[0], 504)
        self.client.request.assert_called_once()

    def test_conflict_from_yummy_is_preserved(self):
        response = requests.Response()
        response.status_code = 409
        response._content = b'{"message":"Pedido ya finalizado"}'
        self.client.request.side_effect = requests.exceptions.HTTPError(response=response)
        status, body = self.request("PUT", "/cocina/comandas/7/kitchen2/state", payload={"state": "done"})
        self.assertEqual(status, 409)
        self.assertEqual(body["detail"], "Pedido ya finalizado")

    def test_disconnection_and_invalid_responses_fail_explicitly(self):
        for failure in (requests.exceptions.ConnectionError(), ValueError("invalid JSON")):
            with self.subTest(failure=type(failure).__name__):
                self.client.request.side_effect = failure
                self.assertEqual(self.request()[0], 502)
        self.client.request.side_effect = None
        for result in ({"ok": False}, []):
            with self.subTest(result=result):
                self.client.request.return_value = result
                self.assertEqual(self.request()[0], 502)

    def test_empty_action_response_is_not_a_confirmation(self):
        self.client.request.return_value = {}
        self.assertEqual(self.request("PUT", "/cocina/comandas/7/kitchen2/state", payload={"state": "done"})[0], 502)

    def test_invalid_config_is_not_shown_as_success(self):
        self.client.request.return_value = {"ok": True, "data": None}
        self.assertEqual(self.request()[0], 502)


if __name__ == "__main__":
    unittest.main()
