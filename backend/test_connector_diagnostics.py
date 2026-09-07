import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.api.v1 import yummy


class ConnectorDiagnosticsTests(unittest.TestCase):
    def installation(self, heartbeat_payload):
        return SimpleNamespace(
            id=uuid4(), local_id="local-1", name="Prueba", system_type="yummy",
            connector_slug="connector-yummy", device_name="Caja", connection_status="ONLINE",
            last_health_check=datetime.utcnow(), last_sync_at=datetime.utcnow(), last_seen_ip="100.1.1.1",
            heartbeat_payload=heartbeat_payload, created_at=datetime.utcnow(),
        )

    def test_serializes_local_connector_diagnostics(self):
        heartbeat = {
            "local_last_sync_at": "2026-09-07T15:00:00",
            "local_last_status": "catalog_synced",
            "local_last_error": "timeout anterior",
            "local_outbox_pending": 3,
            "local_inbox_pending": 2,
        }
        with patch.object(yummy, "object_session", return_value=None):
            result = yummy.serialize_installation(self.installation(heartbeat))
        self.assertEqual(result["local_outbox_pending"], 3)
        self.assertEqual(result["local_inbox_pending"], 2)
        self.assertEqual(result["local_last_error"], "timeout anterior")

    def test_invalid_old_heartbeat_counts_are_safe(self):
        with patch.object(yummy, "object_session", return_value=None):
            result = yummy.serialize_installation(self.installation({"local_outbox_pending": "bad"}))
        self.assertEqual(result["local_outbox_pending"], 0)


if __name__ == "__main__":
    unittest.main()
