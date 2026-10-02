"""llm_gate（同時数の上限・順番待ち）・models_catalog（起動中モデルの一覧・接続テスト）・混雑の判定のテスト（ネットワーク不要）。"""
from __future__ import annotations

import sys
import threading
import time
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace

import httpx
import openai

ROOT = Path(__file__).resolve().parents[1]
for d in ("app", "core"):
    sys.path.insert(0, str(ROOT / d))

from llm_errors import LLMDownAbort, abort_if_llm_down, is_overload_signal  # noqa: E402
from llm_gate import LLMGate, Overloaded  # noqa: E402
from models_catalog import ALIAS_ID, list_models, test_model  # noqa: E402
from store import StudentBusy  # noqa: E402


def _req():
    return httpx.Request("POST", "http://x/v1/chat/completions")


def _status_err(cls, code):
    return cls("x", response=httpx.Response(code, request=_req()), body=None)


class GateTests(unittest.TestCase):
    def test_limits_concurrency(self):
        gate = LLMGate(max_concurrent=2, max_wait_sec=5, max_queue=10)
        cur, peak, lock = 0, 0, threading.Lock()

        def work(i):
            nonlocal cur, peak
            with gate.slot(f"s{i}"):
                with lock:
                    cur += 1
                    peak = max(peak, cur)
                time.sleep(0.05)
                with lock:
                    cur -= 1

        ts = [threading.Thread(target=work, args=(i,)) for i in range(8)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        self.assertEqual(peak, 2)
        self.assertEqual(gate.snapshot()["running"], 0)

    def test_same_student_is_busy(self):
        gate = LLMGate(max_concurrent=2)
        with gate.slot("a"):
            with self.assertRaises(StudentBusy):
                with gate.slot("a"):
                    pass
        with gate.slot("a"):  # 終われば再び使える
            pass

    def test_wait_timeout_is_overloaded_and_frees_key(self):
        gate = LLMGate(max_concurrent=1, max_wait_sec=0.1)
        with gate.slot("a"):
            with self.assertRaises(Overloaded) as cm:
                with gate.slot("b"):
                    pass
            self.assertGreaterEqual(cm.exception.retry_after_sec, 5)
        with gate.slot("b"):  # 待ちを諦めた学生の鍵が残っていない
            pass
        self.assertEqual(gate.snapshot()["waiting"], 0)

    def test_queue_full_rejects_immediately(self):
        gate = LLMGate(max_concurrent=1, max_wait_sec=5, max_queue=0)
        with gate.slot("a"):
            t0 = time.monotonic()
            with self.assertRaises(Overloaded):
                with gate.slot("b"):
                    pass
            self.assertLess(time.monotonic() - t0, 1.0)

    def test_slot_released_on_exception(self):
        gate = LLMGate(max_concurrent=1)
        with self.assertRaises(ValueError):
            with gate.slot("a"):
                raise ValueError
        with gate.slot("b"):
            pass


class OverloadSignalTests(unittest.TestCase):
    def test_signals(self):
        self.assertTrue(is_overload_signal(openai.APITimeoutError(request=_req())))
        self.assertTrue(is_overload_signal(_status_err(openai.RateLimitError, 429)))
        self.assertTrue(is_overload_signal(RuntimeError("http://x -> 429: busy")))
        self.assertTrue(is_overload_signal(TimeoutError()))

    def test_not_signals(self):
        self.assertFalse(is_overload_signal(openai.APIConnectionError(request=_req())))
        self.assertFalse(is_overload_signal(_status_err(openai.InternalServerError, 500)))
        self.assertFalse(is_overload_signal(RuntimeError("http://x -> 502: bad")))
        self.assertFalse(is_overload_signal(urllib.error.URLError("refused")))

    def test_through_abort_chain(self):
        try:
            abort_if_llm_down(openai.APITimeoutError(request=_req()))
        except LLMDownAbort as a:
            self.assertTrue(is_overload_signal(a))
        else:
            self.fail("打ち切られるはず")


def fake_fetch(table):
    def fetch(url, token=None, timeout=6.0):
        v = table.get((url, bool(token)))
        if isinstance(v, Exception):
            raise v
        if v is None:
            raise urllib.error.HTTPError(url, 404, "nf", {}, None)
        return v
    return fetch


BASE = dict(manager_url="http://m:18000", manager_token="vlmk_x", gateway_url="http://g:14000",
            gateway_key="sk-x", env_choices=[], exclude_ids=set())


class CatalogTests(unittest.TestCase):
    def test_manager_instances_running_and_stopped(self):
        inst = [
            {"task_type": "chat", "model_id": "Qwen/A", "running": True, "healthy": True},
            {"task_type": "chat", "model_id": "Qwen/B", "running": False, "healthy": False},
            {"task_type": "chat", "model_id": "Qwen/C", "running": True, "healthy": False},
            {"task_type": "embedding", "model_id": "emb", "running": True, "healthy": True},
            {"task_type": "rerank", "model_id": "rr", "running": True, "healthy": True},
        ]
        r = list_models(**BASE, current="Qwen/A", fetch=fake_fetch({("http://m:18000/api/instances", True): inst}))
        self.assertEqual(r["source"], "manager")
        st = {i["id"]: i["state"] for i in r["items"]}
        self.assertEqual(st["Qwen/A"], "running")
        self.assertEqual(st["Qwen/B"], "stopped")
        self.assertEqual(st["Qwen/C"], "stopped")  # 起動中でも healthy でなければ使えない
        self.assertNotIn("emb", st)
        self.assertNotIn("rr", st)
        self.assertEqual(st[ALIAS_ID], "alias")
        self.assertEqual(r["items"][0]["id"], "Qwen/A")  # 起動中が先頭

    def test_fallback_open_models_when_pat_rejected(self):
        table = {
            ("http://m:18000/api/instances", True): urllib.error.HTTPError("u", 401, "no", {}, None),
            ("http://m:18000/v1/models", False): {"data": [{"id": "Qwen/A"}, {"id": "BAAI/bge-reranker-v2-m3"}, {"id": "Qwen3-Embedding-8B"}]},
        }
        r = list_models(**BASE, current="", fetch=fake_fetch(table))
        self.assertEqual(r["source"], "manager-open")
        self.assertEqual([i["id"] for i in r["items"] if i["state"] == "running"], ["Qwen/A"])
        self.assertIn("api/instances", r["error"])

    def test_fallback_gateway_then_env(self):
        table = {("http://g:14000/v1/models", True): {"data": [{"id": "claude-vllm-local"}]}}
        r = list_models(**{**BASE, "manager_url": ""}, current="", fetch=fake_fetch(table))
        self.assertEqual(r["source"], "gateway")
        self.assertEqual(r["items"][0]["state"], "unknown")
        r = list_models(**{**BASE, "manager_url": "", "gateway_url": "", "env_choices": ["m1", "m2"], "current": "m1"},
                        fetch=fake_fetch({}))
        self.assertEqual(r["source"], "env")
        self.assertEqual({i["id"] for i in r["items"]}, {"m1", "m2", ALIAS_ID})

    def test_current_model_always_listed(self):
        inst = [{"task_type": "chat", "model_id": "Qwen/A", "running": True, "healthy": True}]
        r = list_models(**BASE, current="old/model", fetch=fake_fetch({("http://m:18000/api/instances", True): inst}))
        cur = next(i for i in r["items"] if i["id"] == "old/model")
        self.assertEqual(cur["state"], "stopped")  # 起動中の中に無い、と画面で分かる


class FakeClient:
    def __init__(self, behavior):
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=behavior))


def chunks(*texts):
    for t in texts:
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=t))])


class ModelTestTests(unittest.TestCase):
    def run_test(self, behavior):
        return test_model("m", client_factory=lambda: FakeClient(behavior), extra_body={})

    def test_ok_uses_stream(self):
        seen = {}

        def create(**kw):
            seen.update(kw)
            return chunks("こん", "にちは")

        r = self.run_test(create)
        self.assertTrue(r["ok"])
        self.assertEqual(r["reply"], "こんにちは")
        self.assertTrue(seen["stream"])

    def test_empty_reply(self):
        r = self.run_test(lambda **kw: chunks(None, ""))
        self.assertFalse(r["ok"])
        self.assertEqual(r["kind"], "empty")

    def test_error_kinds(self):
        def raiser(exc):
            def create(**kw):
                raise exc
            return create

        cases = [
            (_status_err(openai.NotFoundError, 404), "not_found"),
            (_status_err(openai.AuthenticationError, 401), "auth"),
            (_status_err(openai.RateLimitError, 429), "busy"),
            (_status_err(openai.InternalServerError, 500), "server_error"),
            (openai.APITimeoutError(request=_req()), "timeout"),
            (openai.APIConnectionError(request=_req()), "connection"),
            (ValueError("x"), "other"),
        ]
        for exc, kind in cases:
            r = self.run_test(raiser(exc))
            self.assertFalse(r["ok"], kind)
            self.assertEqual(r["kind"], kind)


if __name__ == "__main__":
    unittest.main()
