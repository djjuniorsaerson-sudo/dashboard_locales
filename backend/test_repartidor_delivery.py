import unittest

from app.api.v1 import data


class DeliveredOrdersTests(unittest.TestCase):
    def test_only_exit_confirmations_are_shown_as_delivered(self):
        result = data.merge_repartidores_delivered([{
            "order_id": 42,
            "driver_name": "Marcos",
            "cashier_name": "Bianca",
            "change_amount": 1500,
            "marked_at": "2026-09-07T12:00:00",
        }])
        self.assertEqual(result[0]["order_id"], 42)
        self.assertEqual(result[0]["change_amount"], 1500)
        self.assertEqual(result[0]["source"], "exit")

    def test_an_empty_delivery_confirmation_never_falls_back_to_assignment_history(self):
        self.assertEqual(data.merge_repartidores_delivered([]), [])


if __name__ == "__main__":
    unittest.main()
