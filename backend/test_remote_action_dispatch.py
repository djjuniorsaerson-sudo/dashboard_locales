import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import requests
from fastapi import HTTPException
from fastapi.responses import JSONResponse

import app.db.base
from app.api.v1 import data, remote_actions, yummy
from app.models.remote_action import RemoteActionStatus
from app.services import remote_action_dispatch


class RemoteActionDispatchTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.installation = SimpleNamespace(id=uuid4(), base_url="http://test-local.invalid", api_key="test-key", connection_status="ONLINE")
        self.user = SimpleNamespace(id=uuid4(), organization_id=uuid4(), email="test@example.invalid", role="ADMIN")
        self.payload = {"amount": 20, "movement_type": "vale"}
        self.client_patch = patch.object(remote_action_dispatch, "YummyIntegrationClient")
        self.factory = self.client_patch.start()
        self.addCleanup(self.client_patch.stop)
        self.client = self.factory.return_value

    def dispatch(self, online=True):
        return remote_action_dispatch.dispatch_remote_action(
            self.db, self.installation, self.user, "ADD_CASH_MOVEMENT", self.payload,
            "/api/caja/movimientos", online=online, message="En cola",
        )

    def test_success_is_persisted_before_sending_and_uses_action_id(self):
        def respond(*args, **kwargs):
            self.assertGreaterEqual(self.db.commit.call_count, 1)
            action = self.db.add.call_args.args[0]
            self.assertEqual(kwargs["payload"], action.payload)
            self.assertEqual(action.payload["_operation_id"], str(action.id))
            return {"ok": True, "data": {"id": 17}}
        self.client.request.side_effect = respond
        result = self.dispatch()
        self.assertEqual(result["data"]["id"], 17)
        self.assertEqual(self.db.add.call_args.args[0].status, RemoteActionStatus.COMPLETED)

    def test_lost_response_keeps_same_payload_for_worker(self):
        self.client.request.side_effect = requests.Timeout()
        result = self.dispatch()
        self.assertIsInstance(result, JSONResponse)
        self.assertEqual(result.status_code, 202)
        action = self.db.add.call_args.args[0]
        self.assertEqual(action.payload, self.client.request.call_args.kwargs["payload"])
        self.assertEqual(action.status, RemoteActionStatus.PENDING)
        self.db.add.assert_called_once()

    def test_offline_persists_a_single_action_without_http(self):
        result = self.dispatch(online=False)
        self.assertEqual(result.status_code, 202)
        self.db.commit.assert_called_once()
        self.client.request.assert_not_called()
        action = self.db.add.call_args.args[0]
        self.assertEqual(action.payload["_operation_id"], str(action.id))

    def test_validation_error_is_failed_not_queued(self):
        response = requests.Response()
        response.status_code = 400
        self.client.request.side_effect = requests.HTTPError(response=response)
        with self.assertRaises(HTTPException) as raised:
            self.dispatch()
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(self.db.add.call_args.args[0].status, RemoteActionStatus.FAILED)

    def test_server_error_remains_retryable(self):
        response = requests.Response()
        response.status_code = 503
        self.client.request.side_effect = requests.HTTPError(response=response)
        self.assertEqual(self.dispatch().status_code, 202)
        self.assertEqual(self.db.add.call_args.args[0].status, RemoteActionStatus.PENDING)

    def test_unconfirmed_response_is_not_marked_completed(self):
        self.client.request.return_value = {"ok": False}
        self.assertEqual(self.dispatch().status_code, 202)
        self.assertEqual(self.db.add.call_args.args[0].status, RemoteActionStatus.PENDING)

    def test_create_order_is_durable_before_direct_http_and_preserves_id_on_timeout(self):
        payload = remote_actions.CreateOrderPayload(customer_name="Prueba", order_type="Delivery", payment_method="efectivo", items=[])
        duplicate_check = MagicMock()
        duplicate_check.json.return_value = {"ok": True, "data": {"duplicate": False}}

        def lost_response(*args, **kwargs):
            self.assertGreaterEqual(self.db.commit.call_count, 1)
            action = self.db.add.call_args.args[0]
            self.assertEqual(action.payload, kwargs["json"])
            self.assertEqual(action.payload["_operation_id"], str(action.id))
            raise requests.Timeout()

        with patch.object(remote_actions, "get_installation_for_user", return_value=self.installation), \
             patch.object(remote_actions.requests, "get", return_value=duplicate_check), \
             patch.object(remote_actions.requests, "post", side_effect=lost_response) as post:
            result = remote_actions.enqueue_create_order(self.installation.id, payload, self.db, self.user)
        self.assertEqual(result.status_code, 202)
        action = self.db.add.call_args.args[0]
        self.assertEqual(action.payload, post.call_args.kwargs["json"])
        self.assertEqual(action.status, RemoteActionStatus.PENDING)

    def test_duplicate_preflight_stops_before_creating_a_remote_action(self):
        payload = remote_actions.CreateOrderPayload(
            customer_name="Prueba",
            customer_phone="3511234567",
            order_type="Delivery",
            payment_method="efectivo",
            items=[],
        )
        duplicate_check = MagicMock()
        duplicate_check.json.return_value = {
            "ok": True,
            "data": {"duplicate": True, "matched_by": "telefono", "order": {"id": 99}},
        }

        with patch.object(remote_actions, "get_installation_for_user", return_value=self.installation), \
             patch.object(remote_actions.requests, "get", return_value=duplicate_check), \
             patch.object(remote_actions.requests, "post") as post:
            with self.assertRaises(HTTPException) as raised:
                remote_actions.enqueue_create_order(self.installation.id, payload, self.db, self.user)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("crear", raised.exception.detail["message"].lower())
        self.db.add.assert_not_called()
        post.assert_not_called()

    def test_late_failure_cannot_downgrade_completed_action(self):
        action = SimpleNamespace(status=RemoteActionStatus.COMPLETED, result_payload={"body": {"ok": True}})
        self.db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = action
        with patch.object(yummy, "object_session", return_value=self.db):
            result = yummy.connector_fail_remote_action(uuid4(), yummy.RemoteActionResultPayload(result_payload={}, error_message="late failure"), self.installation)
        self.assertEqual(result, {"status": "completed"})
        self.assertEqual(action.status, RemoteActionStatus.COMPLETED)
        self.assertEqual(action.result_payload, {"body": {"ok": True}})

    def test_repeated_completion_keeps_original_result(self):
        action = SimpleNamespace(status=RemoteActionStatus.COMPLETED, result_payload={"body": {"id": 17}})
        self.db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = action
        with patch.object(yummy, "object_session", return_value=self.db):
            result = yummy.connector_complete_remote_action(uuid4(), yummy.RemoteActionResultPayload(result_payload={"body": {"id": 18}}), self.installation)
        self.assertEqual(result, {"status": "completed"})
        self.assertEqual(action.result_payload["body"]["id"], 17)

    def test_stock_endpoint_sends_target_without_recomputing_delta(self):
        expected = {"ok": True, "data": {"previous_stock": 10, "new_stock": 20, "movement": {"id": 1}}}
        with patch.object(data, "get_installation_for_user", return_value=self.installation), \
             patch.object(data, "installation_is_online", return_value=True), \
             patch.object(data, "dispatch_remote_action", return_value=expected) as dispatch:
            result = data.update_product_stock(7, data.StockData(stock=20), str(self.installation.id), self.db, self.user)
        self.assertEqual(result["new_stock"], 20)
        self.assertEqual(dispatch.call_args.args[4]["target_stock"], 20)
        self.assertNotIn("quantity", dispatch.call_args.args[4])


if __name__ == "__main__":
    unittest.main()
