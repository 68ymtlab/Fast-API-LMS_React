"""llm_status: LLM が使えないことの判定・回路遮断・自動復旧・手動メンテナンスのテスト（ネットワーク不要）。"""
from __future__ import annotations

import socket
import sys
import unittest
import urllib.error
from pathlib import Path

import httpx
import openai

APP_DIR = Path(__file__).resolve().parents[1] / "app"
CORE_DIR = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(CORE_DIR))

from llm_errors import LLMDownAbort, abort_if_llm_down  # noqa: E402
from llm_status import (  # noqa: E402
    DEFAULT_MESSAGE,
    FORCED_DEFAULT_MESSAGE,
    LLMStatus,
    LLMUnavailable,
    http_probe,
    is_llm_unavailable,
)


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t

    def advance(self, sec):
        self.t += sec


def _req():
    return httpx.Request("POST", "http://llm.example/v1/chat/completions")


def _status_error(cls, code):
    return cls("x", response=httpx.Response(code, request=_req()), body=None)


class ClassificationTests(unittest.TestCase):
    def test_connection_problems_are_unavailable(self):
        self.assertTrue(is_llm_unavailable(openai.APIConnectionError(request=_req())))
        self.assertTrue(is_llm_unavailable(openai.APITimeoutError(request=_req())))
        self.assertTrue(is_llm_unavailable(urllib.error.URLError("refused")))
        self.assertTrue(is_llm_unavailable(socket.timeout("timed out")))
        self.assertTrue(is_llm_unavailable(ConnectionRefusedError()))
        self.assertTrue(is_llm_unavailable(TimeoutError()))

    def test_gateway_errors_are_unavailable(self):
        for cls, code in ((openai.InternalServerError, 502), (openai.InternalServerError, 503), (openai.RateLimitError, 429),
                          (openai.AuthenticationError, 401), (openai.PermissionDeniedError, 403), (openai.NotFoundError, 404)):
            self.assertTrue(is_llm_unavailable(_status_error(cls, code)), f"{cls.__name__} {code}")
        self.assertTrue(is_llm_unavailable(RuntimeError("http://x/v1/embeddings -> 502: Bad Gateway")))
        self.assertTrue(is_llm_unavailable(RuntimeError("http://x/rerank -> 401: unauthorized")))
        self.assertTrue(is_llm_unavailable(urllib.error.HTTPError("http://x", 503, "unavailable", {}, None)))

    def test_other_errors_are_not_unavailable(self):
        self.assertFalse(is_llm_unavailable(ValueError("bad input")))
        self.assertFalse(is_llm_unavailable(KeyError("x")))
        self.assertFalse(is_llm_unavailable(RuntimeError("http://x/v1/embeddings -> 400: bad request")))
        self.assertFalse(is_llm_unavailable(_status_error(openai.BadRequestError, 400)))
        self.assertFalse(is_llm_unavailable(urllib.error.HTTPError("http://x", 400, "bad", {}, None)))

    def test_cause_chain_is_followed(self):
        try:
            try:
                raise urllib.error.URLError("refused")
            except Exception as inner:
                raise RuntimeError("検索に失敗") from inner
        except RuntimeError as outer:
            self.assertTrue(is_llm_unavailable(outer))


class AbortTests(unittest.TestCase):
    """研究側のコードの `except Exception:`（失敗を握りつぶして続ける）を突き抜けて、質問全体を打ち切れること。"""

    def test_abort_passes_through_except_exception(self):
        def swallowing_advisory_call():
            try:
                raise urllib.error.URLError("refused")
            except Exception as exc:  # 研究側のコードと同じ書き方
                abort_if_llm_down(exc)   # LLM が使えない原因なら、ここで打ち切る
                return "fallback"

        with self.assertRaises(LLMDownAbort):
            swallowing_advisory_call()
        # BaseException なので、途中の `except Exception:` に捕まらない
        def outer():
            try:
                swallowing_advisory_call()
            except Exception:
                return "握りつぶされた"
        with self.assertRaises(LLMDownAbort):
            outer()

    def test_non_llm_errors_are_not_aborted(self):
        def advisory():
            try:
                raise ValueError("JSON が壊れている")
            except Exception as exc:
                abort_if_llm_down(exc)
                return "fallback"
        self.assertEqual(advisory(), "fallback")

    def test_ignore_timeouts_for_advisory_calls(self):
        # プランナーのような補助の呼び出し: 遅いだけ（タイムアウト）なら、従来どおり安全な代替に切り替えて続ける
        for timeout_exc in (TimeoutError("planner timeout"), openai.APITimeoutError(request=_req()), socket.timeout("t")):
            abort_if_llm_down(timeout_exc, ignore_timeouts=True)   # 打ち切らない
            with self.assertRaises(LLMDownAbort):
                abort_if_llm_down(timeout_exc)                       # 通常の呼び出しは打ち切る
        # 接続できない・サーバーのエラーは、補助でも打ち切る（落ちている）
        for down_exc in (openai.APIConnectionError(request=_req()), urllib.error.URLError("refused"), ConnectionRefusedError(),
                         _status_error(openai.InternalServerError, 502)):
            with self.assertRaises(LLMDownAbort):
                abort_if_llm_down(down_exc, ignore_timeouts=True)

    def test_abort_is_classified_as_unavailable(self):
        self.assertTrue(is_llm_unavailable(LLMDownAbort("x")))


class BreakerTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.s = LLMStatus(breaker_sec=30, now_fn=self.clock)

    def test_ok_state_allows_calls(self):
        self.s.check()
        self.s.record_success()
        self.s.check()
        self.assertEqual(self.s.snapshot()["state"], "ok")

    def test_failure_makes_following_calls_fail_fast(self):
        self.s.record_failure("接続できない")
        with self.assertRaises(LLMUnavailable) as cm:
            self.s.check()
        self.assertEqual(cm.exception.message, DEFAULT_MESSAGE)
        self.assertEqual(cm.exception.state, "down")
        self.assertGreaterEqual(cm.exception.retry_after_sec, 1)
        snap = self.s.snapshot()
        self.assertEqual((snap["ok"], snap["state"]), (False, "down"))
        self.assertEqual(snap["message"], DEFAULT_MESSAGE)
        self.assertIsNotNone(snap["since"])

    def test_after_breaker_one_trial_then_others_still_rejected(self):
        self.s.record_failure("x")
        self.clock.advance(31)
        self.s.check()  # 半開: 1件だけ通る
        with self.assertRaises(LLMUnavailable):
            self.s.check()  # 試しの結果が出るまで、他は断る

    def test_trial_success_closes_breaker(self):
        self.s.record_failure("x")
        self.clock.advance(31)
        self.s.check()
        self.s.record_success()
        self.s.check()
        self.s.check()
        self.assertEqual(self.s.snapshot()["state"], "ok")

    def test_trial_failure_reopens_breaker(self):
        self.s.record_failure("x")
        self.clock.advance(31)
        self.s.check()
        self.s.record_failure("y")
        with self.assertRaises(LLMUnavailable):
            self.s.check()
        self.clock.advance(31)
        self.s.check()  # また1件だけ試せる

    def test_lost_trial_is_released_after_lease(self):
        self.s.record_failure("x")
        self.clock.advance(31)
        self.s.check()  # 試しが結果を報告しないまま消えた
        self.clock.advance(LLMStatus.TRIAL_LEASE_SEC + 1)
        self.s.check()  # 救済: 次の1件を試せる


class ProbeTests(unittest.TestCase):
    def test_probe_detects_outage_and_recovery_without_any_student_request(self):
        clock = Clock()
        result = {"ok": True, "reason": "HTTP 200"}
        calls = []

        def probe():
            calls.append(clock())
            return (result["ok"], result["reason"])

        s = LLMStatus(probe, breaker_sec=30, probe_ttl_sec=30, now_fn=clock)
        self.assertEqual(s.snapshot(probe=True)["state"], "ok")

        # 30 秒より前は再確認しない（/health が頻繁に呼ばれても、LLM に負荷をかけない）
        clock.advance(10)
        s.snapshot(probe=True)
        self.assertEqual(len(calls), 1)

        # 落ちる → 次の確認で検知
        result.update(ok=False, reason="接続拒否")
        clock.advance(25)
        snap = s.snapshot(probe=True)
        self.assertEqual((snap["ok"], snap["state"]), (False, "down"))
        self.assertIn("接続拒否", snap["reason"])

        # 遮断時間の間は確認しない。過ぎたら確認し、まだ落ちていれば遮断を延ばす
        n = len(calls)
        clock.advance(10)
        s.snapshot(probe=True)
        self.assertEqual(len(calls), n)
        clock.advance(25)
        self.assertEqual(s.snapshot(probe=True)["state"], "down")

        # 復旧 → 遮断時間が過ぎた後の確認で、自動的に元に戻る
        result.update(ok=True, reason="HTTP 200")
        clock.advance(31)
        self.assertEqual(s.snapshot(probe=True)["state"], "ok")
        s.check()

    def test_without_probe_function_refresh_is_noop(self):
        s = LLMStatus(None)
        s.snapshot(probe=True)
        self.assertEqual(s.snapshot()["state"], "unknown")
        self.assertTrue(s.snapshot()["ok"], "まだ確認していない（unknown）ときは、メンテナンス表示を出さない")


class ForcedMaintenanceTests(unittest.TestCase):
    def test_forced_maintenance_blocks_with_custom_message(self):
        s = LLMStatus(None)
        s.set_forced(True, "AIサーバーの再起動のため 15:00〜16:00 は使えません。")
        with self.assertRaises(LLMUnavailable) as cm:
            s.check()
        self.assertEqual(cm.exception.state, "maintenance")
        self.assertIn("15:00", cm.exception.message)
        snap = s.snapshot()
        self.assertEqual((snap["ok"], snap["state"]), (False, "maintenance"))
        self.assertIn("15:00", snap["message"])

    def test_forced_default_message_and_release(self):
        s = LLMStatus(None, forced=True)
        self.assertEqual(s.snapshot()["message"], FORCED_DEFAULT_MESSAGE)
        s.set_forced(False)
        s.check()
        self.assertTrue(s.snapshot()["ok"])

    def test_forced_takes_priority_and_probe_is_skipped(self):
        called = []
        s = LLMStatus(lambda: called.append(1) or (True, "ok"), forced=True)
        s.snapshot(probe=True)
        self.assertEqual(called, [], "手動のメンテナンス中は疎通確認しない")


class HttpProbeTests(unittest.TestCase):
    def test_closed_port_is_not_ok(self):
        ok, reason = http_probe("http://127.0.0.1:9", "k", timeout=1.0)
        self.assertFalse(ok)
        self.assertTrue(reason)

    def _serve(self, status):
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(status); self.send_header("Content-Length", "0"); self.end_headers()

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        return f"http://127.0.0.1:{srv.server_address[1]}"

    def test_server_that_answers_is_reachable_even_if_models_path_is_unavailable(self):
        # /v1/models が 401/403/404 でも、サーバーは生きている。ここで「落ちている」とすると、チャットが動くのに全員が「メンテナンス中」になる
        for status in (200, 401, 403, 404):
            ok, reason = http_probe(self._serve(status), "k", timeout=2.0)
            self.assertTrue(ok, f"HTTP {status}")
            self.assertEqual(reason, f"HTTP {status}")

    def test_server_errors_are_not_ok(self):
        for status in (500, 502, 503):
            ok, _ = http_probe(self._serve(status), "k", timeout=2.0)
            self.assertFalse(ok, f"HTTP {status}")


if __name__ == "__main__":
    unittest.main()
