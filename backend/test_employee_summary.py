import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import requests
from fastapi import HTTPException

from app.api.v1 import data


class EmployeeSummaryTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.installation = SimpleNamespace(id=uuid4(), base_url="http://test-local.invalid", api_key="test-only")
        self.user = SimpleNamespace(organization_id=uuid4())
        self.employees = [{
            "id": 10, "name": "Prueba", "salary_base": 100, "adelantos": 30, "final_salary": 70,
            "events": [{"id": 500, "event_type": "falta", "amount": 10, "created_at": "2026-09-07T10:00:00"}],
            "payments": [{"id": "pago-2", "event_type": "adelanto", "amount": 20, "sort_at": "2026-09-07T11:00:00"}],
        }]
        patches = {
            "install": patch.object(data, "get_installation_for_user", return_value=self.installation),
            "client": patch.object(data, "YummyIntegrationClient"),
            "load": patch.object(data, "load_installation_snapshot", return_value=None),
            "save": patch.object(data, "save_installation_snapshot"),
        }
        for name, patcher in patches.items():
            setattr(self, name, patcher.start())
            self.addCleanup(patcher.stop)
        self.client.return_value.request.return_value = self.employees

    def summary(self):
        return data.get_employee_summary(self.installation.id, self.db, self.user)

    def test_one_remote_read_supplies_both_totals_and_history(self):
        summary = self.summary()
        self.client.return_value.request.assert_called_once_with("GET", "/api/integration/employees")
        self.assertEqual(summary["employees"], self.employees)
        self.assertEqual([row["id"] for row in summary["novedades"]], ["pago-2", 500])
        self.assertEqual(sum(row["amount"] for row in summary["novedades"]), summary["employees"][0]["adelantos"])
        self.assertEqual(summary["source"], "live")
        self.assertEqual(self.save.call_args.args[3], {"employees": summary["employees"], "novedades": summary["novedades"]})

    def test_new_vale_or_falta_appears_with_its_updated_amount(self):
        first = self.summary()
        updated = deepcopy(self.employees)
        updated[0]["events"].append({"id": 501, "event_type": "falta", "amount": 5, "created_at": "2026-09-07T12:00:00"})
        updated[0]["adelantos"] = 35
        updated[0]["final_salary"] = 65
        self.client.return_value.request.return_value = updated
        second = self.summary()
        self.assertEqual(len(first["novedades"]), 2)
        self.assertEqual(len(second["novedades"]), 3)
        self.assertEqual(second["novedades"][0]["id"], 501)
        self.assertEqual(second["employees"][0]["final_salary"], 65)

    def test_empty_live_data_clears_history_instead_of_restoring_old_events(self):
        self.load.return_value = {"employees": self.employees, "novedades": [{"id": 99}]}
        self.client.return_value.request.return_value = []
        self.assertEqual(self.summary(), {"employees": [], "novedades": [], "source": "live"})

    def test_deleted_event_is_removed_with_its_discount(self):
        employee = deepcopy(self.employees[0])
        employee.update(events=[], adelantos=20, final_salary=80)
        self.client.return_value.request.return_value = [employee]
        summary = self.summary()
        self.assertEqual([row["id"] for row in summary["novedades"]], ["pago-2"])
        self.assertEqual(summary["employees"][0]["adelantos"], 20)

    def test_offline_uses_one_cached_source_not_an_unrelated_history(self):
        self.client.return_value.request.side_effect = requests.Timeout()
        self.load.return_value = {"employees": self.employees, "novedades": [{"id": "stale"}]}
        summary = self.summary()
        self.assertEqual(summary["source"], "snapshot")
        self.assertEqual([row["id"] for row in summary["novedades"]], ["pago-2", 500])
        self.save.assert_not_called()

    def test_incomplete_response_without_cache_is_an_error(self):
        self.client.return_value.request.return_value = [{"id": 10, "adelantos": 30}]
        with self.assertRaises(HTTPException) as error:
            self.summary()
        self.assertEqual(error.exception.status_code, 503)

    def test_unchanged_poll_does_not_append_another_snapshot(self):
        self.load.return_value = {"employees": self.employees, "novedades": data.employee_novedades_from_rows(self.employees)}
        self.summary()
        self.save.assert_not_called()

    def test_snapshot_storage_failure_does_not_replace_live_data_with_old_data(self):
        self.save.side_effect = RuntimeError("snapshot unavailable")
        summary = self.summary()
        self.assertEqual(summary["source"], "live")
        self.assertEqual(summary["employees"], self.employees)
        self.db.rollback.assert_called_once()

    def test_unknown_local_does_not_contact_yummy(self):
        self.install.return_value = None
        with self.assertRaises(HTTPException) as error:
            self.summary()
        self.assertEqual(error.exception.status_code, 404)
        self.client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
