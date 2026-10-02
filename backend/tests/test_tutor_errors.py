"""AI チューターのエラーの種類（code）と、LLM に繋がらないときの『メンテナンス中』表示用の情報のテスト（ネットワーク不要）。"""
import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@db:5432/x")

import httpx  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.core.tutor_errors import (  # noqa: E402
    MAINTENANCE_MESSAGE,
    STARTING_MESSAGE,
    TutorServiceError,
    register_tutor_error_handler,
)
from api.routers import tutor_router  # noqa: E402

REAL_ASYNC_CLIENT = httpx.AsyncClient
USER = SimpleNamespace(id=5)


def _patch_transport(handler):
    transport = httpx.MockTransport(handler)
    return patch.object(tutor_router.httpx, "AsyncClient", lambda **kw: REAL_ASYNC_CLIENT(transport=transport, **kw))


def _json_response(status, body):
    return lambda request: httpx.Response(status, json=body)


class ErrorFromResponseTests(unittest.TestCase):
    def test_llm_unavailable_keeps_message_state_and_retry_after(self):
        e = tutor_router._error_from_response(503, {
            "detail": "AIチューターは現在メンテナンス中です。15:00 まで。", "code": "llm_unavailable", "state": "maintenance", "retry_after_sec": 60,
        })
        self.assertEqual((e.status_code, e.code), (503, "llm_unavailable"))
        self.assertIn("15:00", e.detail)
        self.assertEqual(e.extra, {"state": "maintenance", "retry_after_sec": 60})
        self.assertEqual(e.headers.get("Retry-After"), "60")

    def test_llm_unavailable_without_detail_uses_default_message(self):
        e = tutor_router._error_from_response(503, {"code": "llm_unavailable"})
        self.assertEqual(e.detail, MAINTENANCE_MESSAGE)

    def test_503_without_code_means_tutor_is_starting(self):
        e = tutor_router._error_from_response(503, {"detail": "チューターがまだ初期化されていません"})
        self.assertEqual((e.status_code, e.code, e.detail), (503, "starting", STARTING_MESSAGE))

    def test_busy_and_overloaded_codes_are_passed_through(self):
        e = tutor_router._error_from_response(429, {"detail": "前の質問に回答中です。", "code": "busy"})
        self.assertEqual((e.status_code, e.code), (429, "busy"))
        e = tutor_router._error_from_response(503, {"detail": "混み合っています。", "code": "overloaded"})
        self.assertEqual((e.status_code, e.code), (503, "overloaded"))

    def test_unknown_error_is_generic(self):
        e = tutor_router._error_from_response(500, None)
        self.assertEqual((e.status_code, e.code), (500, "error"))
        self.assertTrue(e.detail)


class ForwardTests(unittest.TestCase):
    def run_forward(self, handler):
        with _patch_transport(handler):
            return asyncio.run(tutor_router._forward("POST", "/session/message", USER, json={"text": "x"}))

    def test_success_returns_json(self):
        self.assertEqual(self.run_forward(_json_response(200, {"reply": "こんにちは"})), {"reply": "こんにちは"})

    def test_llm_unavailable_becomes_503_with_code(self):
        with self.assertRaises(TutorServiceError) as cm:
            self.run_forward(_json_response(503, {"detail": "メンテナンス中です", "code": "llm_unavailable", "state": "down", "retry_after_sec": 20}))
        self.assertEqual((cm.exception.status_code, cm.exception.code), (503, "llm_unavailable"))

    def test_tutor_service_unreachable_is_tutor_unavailable(self):
        def refuse(request):
            raise httpx.ConnectError("refused")
        with self.assertRaises(TutorServiceError) as cm:
            self.run_forward(refuse)
        self.assertEqual((cm.exception.status_code, cm.exception.code, cm.exception.detail), (502, "tutor_unavailable", MAINTENANCE_MESSAGE))

    def test_timeout_has_its_own_code(self):
        def slow(request):
            raise httpx.ReadTimeout("slow")
        with self.assertRaises(TutorServiceError) as cm:
            self.run_forward(slow)
        self.assertEqual((cm.exception.status_code, cm.exception.code), (504, "timeout"))


class HealthTests(unittest.TestCase):
    def health(self, handler):
        with _patch_transport(handler):
            return asyncio.run(tutor_router.tutor_health(current_user=USER))

    def test_llm_state_is_passed_through(self):
        llm = {"ok": False, "state": "down", "message": "メンテナンス中です", "retry_after_sec": 12, "reason": "x"}
        r = self.health(_json_response(200, {"ok": True, "llm": llm}))
        self.assertEqual((r["ok"], r["llm"]["ok"], r["llm"]["state"]), (True, False, "down"))
        self.assertEqual(r["llm"]["message"], "メンテナンス中です")

    def test_tutor_service_down_is_reported_not_raised(self):
        def refuse(request):
            raise httpx.ConnectError("refused")
        r = self.health(refuse)
        self.assertEqual((r["ok"], r["llm"]["ok"], r["llm"]["state"]), (False, False, "tutor_down"))
        self.assertEqual(r["llm"]["message"], MAINTENANCE_MESSAGE)

    def test_tutor_starting(self):
        r = self.health(_json_response(200, {"ok": False}))
        self.assertEqual((r["llm"]["ok"], r["llm"]["state"], r["llm"]["message"]), (False, "starting", STARTING_MESSAGE))

    def test_old_tutor_without_llm_field_is_treated_as_ok(self):
        r = self.health(_json_response(200, {"ok": True}))
        self.assertTrue(r["llm"]["ok"])


class HandlerTests(unittest.TestCase):
    def test_response_body_has_detail_and_code(self):
        app = FastAPI()
        register_tutor_error_handler(app)

        @app.get("/boom")
        def boom():
            raise tutor_router._error_from_response(503, {"detail": "メンテナンス中です", "code": "llm_unavailable", "state": "down", "retry_after_sec": 9})

        r = TestClient(app).get("/boom")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json(), {"detail": "メンテナンス中です", "code": "llm_unavailable", "state": "down", "retry_after_sec": 9})
        self.assertEqual(r.headers.get("retry-after"), "9")


if __name__ == "__main__":
    unittest.main()
