"""LLM を使う質問（ターン）の同時数の上限と、順番待ち。

背景: 学内の LLM サーバーは、同時に処理できる数が少ない（例: 同時 2 リクエスト）。1 回の質問は LLM を何度も呼ぶので、
人数が増えると 1 件の応答が極端に遅くなる（実測: 同時 12 人で最も遅い人が 72 秒）。25〜30 人が一斉に質問すると、
backend の待ち時間（110 秒）を超えてタイムアウトになる。
→ 同時に処理する質問の数を絞り、順番を待たせる。待ちが長くなりすぎるときは、110 秒待たせずに、すぐ
  「混み合っています。少し待ってからもう一度」と返す（503・code=overloaded）。待っている間は DB の接続を握らない。
"""
from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from typing import Callable

from store import StudentBusy

OVERLOADED_MESSAGE = "AIチューターが混み合っています。順番待ちが長くなっているため、少し待ってからもう一度お試しください。"


class Overloaded(Exception):
    """混み合っていて、順番を待てない。利用者には message をそのまま見せてよい。"""

    def __init__(self, message: str = OVERLOADED_MESSAGE, *, retry_after_sec: int = 20, reason: str = ""):
        super().__init__(message)
        self.message = message
        self.retry_after_sec = retry_after_sec
        self.reason = reason


class LLMGate:
    def __init__(
        self,
        max_concurrent: int = 4,
        max_wait_sec: float = 45.0,
        max_queue: int = 40,
        now_fn: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_concurrent = max(1, int(max_concurrent))
        self.max_wait_sec = float(max_wait_sec)
        self.max_queue = max(0, int(max_queue))
        self._now = now_fn
        self._cond = threading.Condition()
        self._running = 0
        self._waiting = 0
        self._keys: set[str] = set()  # 実行中・順番待ちの学生（1人の同時の質問は1件まで）
        self._ema_sec = 15.0  # 1 回の質問にかかる時間の移動平均（待ち時間の見積もりに使う）

    def _estimate_retry(self) -> int:
        ahead = self._running + self._waiting
        est = self._ema_sec * ahead / self.max_concurrent
        return int(min(60, max(5, est)))

    @contextmanager
    def slot(self, key: str):
        """質問を処理する枠を取る。with の間が「処理中」。取れなければ Overloaded、同じ学生が既に処理中なら StudentBusy。"""
        with self._cond:
            if key in self._keys:
                raise StudentBusy(key)  # 同じ学生の前の質問が処理中・順番待ち（1人の連打で枠を占領させない）
            if self._running >= self.max_concurrent and self._waiting >= self.max_queue:
                raise Overloaded(retry_after_sec=self._estimate_retry(), reason="queue full")
            self._keys.add(key)
            self._waiting += 1
            deadline = self._now() + self.max_wait_sec
            try:
                while self._running >= self.max_concurrent:
                    remaining = deadline - self._now()
                    if remaining <= 0:
                        raise Overloaded(retry_after_sec=self._estimate_retry(), reason="wait timeout")
                    self._cond.wait(remaining)
                self._running += 1
            except BaseException:
                self._keys.discard(key)
                raise
            finally:
                self._waiting -= 1
        started = self._now()
        try:
            yield
        finally:
            with self._cond:
                self._running -= 1
                self._keys.discard(key)
                took = self._now() - started
                self._ema_sec = 0.7 * self._ema_sec + 0.3 * took
                self._cond.notify()

    def snapshot(self) -> dict:
        with self._cond:
            return {"running": self._running, "waiting": self._waiting, "max_concurrent": self.max_concurrent,
                    "avg_turn_sec": round(self._ema_sec, 1)}
