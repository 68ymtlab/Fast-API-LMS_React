import unittest

from api.core.client_ip import get_client_ip


class ClientIpTests(unittest.TestCase):
    def test_uses_single_forwarded_value(self):
        self.assertEqual(get_client_ip({"x-forwarded-for": "203.0.113.7"}, "10.200.0.5"), "203.0.113.7")

    def test_ignores_spoofed_left_entries(self):
        # クライアントが先頭に偽のIPを書いても、一番右（信頼できる中継が付けた値）を使う
        self.assertEqual(get_client_ip({"x-forwarded-for": "1.2.3.4, 203.0.113.7"}, "10.200.0.5"), "203.0.113.7")
        self.assertEqual(get_client_ip({"x-forwarded-for": "9.9.9.9,8.8.8.8, 203.0.113.7 "}, "10.200.0.5"), "203.0.113.7")

    def test_falls_back_to_connection_address(self):
        self.assertEqual(get_client_ip({}, "10.200.0.5"), "10.200.0.5")
        self.assertEqual(get_client_ip({"x-forwarded-for": ""}, "10.200.0.5"), "10.200.0.5")
        self.assertEqual(get_client_ip({}, None), "unknown")

    def test_non_ip_value_is_not_used_as_key(self):
        # 任意の文字列をキーにされてメモリを増やされないように、IP の形でなければ接続元を使う
        self.assertEqual(get_client_ip({"x-forwarded-for": "not-an-ip"}, "10.200.0.5"), "10.200.0.5")
        self.assertEqual(get_client_ip({"x-forwarded-for": "<script>"}, "10.200.0.5"), "10.200.0.5")

    def test_ipv6_is_normalized(self):
        self.assertEqual(get_client_ip({"x-forwarded-for": "2001:DB8::1"}, None), "2001:db8::1")


if __name__ == "__main__":
    unittest.main()
