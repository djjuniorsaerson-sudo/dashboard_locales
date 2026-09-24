import unittest

from app.api.v1 import data
from app.services.extractor_modules import ModulesExtractor


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

    def test_driver_summary_uses_open_shift_and_counts_group_orders(self):
        class Result:
            @staticmethod
            def fetchall():
                return [(3, "Marcos", "noche", True, 25000, 4)]

        class Database:
            def __init__(self):
                self.query = ""

            def execute(self, query):
                self.query = str(query)
                return Result()

        database = Database()
        rows = ModulesExtractor.get_repartidores(database)

        self.assertIn("delivery_shift_state", database.query)
        self.assertIn("v.created_at >= t.started_at", database.query)
        self.assertIn("COUNT(vp.order_id)", database.query)
        self.assertEqual(rows[0]["trips_count"], 4)


if __name__ == "__main__":
    unittest.main()
