import unittest

from api.core import login_rate_limit as rl


class LoginRateLimitTests(unittest.TestCase):
    def setUp(self):
        rl._attempts.clear()

    def test_limit_is_ten_failures(self):
        self.assertEqual(rl.MAX_ATTEMPTS, 10)
        for i in range(9):
            rl.record_failure("a@example.com", "203.0.113.7")
            self.assertEqual(rl.seconds_until_unlock("a@example.com", "203.0.113.7"), 0, f"{i + 1}回目ではまだロックされない")
        rl.record_failure("a@example.com", "203.0.113.7")
        self.assertGreater(rl.seconds_until_unlock("a@example.com", "203.0.113.7"), 0, "10回目でロックされる")

    def test_lock_is_per_email_and_ip(self):
        for _ in range(10):
            rl.record_failure("a@example.com", "203.0.113.7")
        self.assertGreater(rl.seconds_until_unlock("a@example.com", "203.0.113.7"), 0)
        self.assertEqual(rl.seconds_until_unlock("b@example.com", "203.0.113.7"), 0, "別のメールは影響を受けない")
        self.assertEqual(rl.seconds_until_unlock("a@example.com", "198.51.100.9"), 0, "別のIPは影響を受けない")

    def test_success_resets_counter(self):
        for _ in range(9):
            rl.record_failure("a@example.com", "203.0.113.7")
        rl.record_success("a@example.com", "203.0.113.7")
        rl.record_failure("a@example.com", "203.0.113.7")
        self.assertEqual(rl.seconds_until_unlock("a@example.com", "203.0.113.7"), 0)

    def test_email_is_case_insensitive(self):
        for _ in range(10):
            rl.record_failure("A@Example.com", "203.0.113.7")
        self.assertGreater(rl.seconds_until_unlock("a@example.com ", "203.0.113.7"), 0)


if __name__ == "__main__":
    unittest.main()
