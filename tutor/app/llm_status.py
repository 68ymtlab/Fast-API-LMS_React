"""LLM（学内の AI サーバー）が使えない状態の検知と、利用者への「メンテナンス中」表示のための状態管理。

目的:
  1. LLM に繋がらない・応答しないとき、学生に「メンテナンス中」と分かりやすく伝える（汎用の 500 エラーにしない）
  2. 繋がらない間は、質問のたびに長く待たせない（回路遮断: 一度失敗したら一定時間は即座に断る）。
     待たせると、1件ごとに DB のロック用接続とスレッドを握り続け、tutor 全体が止まる
  3. 復旧したら、人手なしで自動的に元に戻る（定期的な疎通確認と、1件だけ通して試す「半開」）
  4. 計画的なメンテナンス（学内の AI サーバーの再起動など）のために、手動で「メンテナンス中」にできる

状態: ok（使える）／ down（繋がらない・自動検知）／ maintenance（手動で停止中）／ unknown（まだ確認していない）
"""
from __future__ import annotations

import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

DEFAULT_MESSAGE = (
    "AIチューターは現在メンテナンス中です。学内のAIサーバーに接続できないため、いまは質問に答えられません。"
    "しばらくしてからもう一度お試しください。"
)
FORCED_DEFAULT_MESSAGE = "AIチューターは現在メンテナンス中です。しばらくしてからもう一度お試しください。"


class LLMUnavailable(Exception):
    """LLM が使えない。利用者には message をそのまま見せてよい（内部の詳細は reason に入れ、画面には出さない）。"""

    def __init__(self, message: str = DEFAULT_MESSAGE, *, state: str = "down", reason: str = "", retry_after_sec: int = 30):
        super().__init__(message)
        self.message = message
        self.state = state
        self.reason = reason
        self.retry_after_sec = retry_after_sec


# 判定ロジック（is_llm_unavailable / describe）は core/llm_errors.py（研究側のコードからも使うため）。ここから再エクスポートする
from llm_errors import describe, is_llm_unavailable  # noqa: E402,F401


def _utc_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_probe(base_url: str, api_key: str, timeout: float = 3.0) -> tuple[bool, str]:
    """LLM ゲートウェイの疎通確認（GET /v1/models）。サーバーが応答すれば「繋がっている」。

    見るのは「繋がるか」だけ。接続できない・応答しない・サーバーのエラー（5xx）のときだけ「落ちている」とする。
    401/403/404 は、サーバーは生きている（このパスが使えない・権限が無いだけ）ので「繋がっている」扱い。
    ゲートウェイによっては /v1/models が使えない（管理画面のモデル一覧も、使えないときは env の候補にフォールバックする）ため、
    ここで 4xx を「落ちている」とすると、チャットは動くのに全員に「メンテナンス中」と出てしまう。
    本当に認証やモデル名が誤っているときは、実際の質問の失敗（401/403/404）で検知される（core/llm_errors.py）。
    """
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return (resp.status < 500, f"HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        return (exc.code < 500, f"HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001  接続拒否・タイムアウト・名前解決の失敗など
        return (False, describe(exc))


class LLMStatus:
    """LLM の状態（回路遮断つき）。スレッドセーフ。"""

    TRIAL_LEASE_SEC = 60.0  # 半開の試し1件が、結果を報告しないまま消えたときの救済

    def __init__(
        self,
        probe_fn: Callable[[], tuple[bool, str]] | None = None,
        *,
        breaker_sec: float = 30.0,
        probe_ttl_sec: float = 30.0,
        now_fn: Callable[[], float] = time.time,
        forced: bool = False,
        forced_message: str = "",
    ) -> None:
        self._probe_fn = probe_fn
        self.breaker_sec = breaker_sec
        self.probe_ttl_sec = probe_ttl_sec
        self._now = now_fn
        self._lock = threading.RLock()
        self._state = "unknown"  # ok / down / unknown
        self._reason = ""
        self._since: float | None = None
        self._down_until = 0.0
        self._trial_until = 0.0
        self._last_probe = 0.0
        self._forced = bool(forced)
        self._forced_message = forced_message.strip()

    # ---- 手動のメンテナンス ----
    def set_forced(self, enabled: bool, message: str = "") -> None:
        with self._lock:
            self._forced = bool(enabled)
            self._forced_message = (message or "").strip()

    @property
    def forced(self) -> bool:
        return self._forced

    # ---- 状態の更新 ----
    def record_success(self) -> None:
        with self._lock:
            self._state = "ok"
            self._reason = ""
            self._since = None
            self._down_until = 0.0
            self._trial_until = 0.0

    def record_failure(self, reason: str = "") -> None:
        with self._lock:
            now = self._now()
            if self._state != "down":
                self._since = now
            self._state = "down"
            self._reason = reason
            self._down_until = now + self.breaker_sec
            self._trial_until = 0.0

    # ---- 呼び出しの前に（回路遮断）----
    def check(self) -> None:
        """使えない状態なら LLMUnavailable。使える（または1件だけ試してよい）なら何もしない。"""
        with self._lock:
            if self._forced:
                raise LLMUnavailable(
                    self._forced_message or FORCED_DEFAULT_MESSAGE, state="maintenance", reason="manual", retry_after_sec=60
                )
            if self._state != "down":
                return
            now = self._now()
            if now < self._down_until:
                raise LLMUnavailable(state="down", reason=self._reason, retry_after_sec=max(1, int(self._down_until - now)))
            # 半開: 遮断時間が過ぎた。1件だけ通して試す（他は引き続き即座に断る）
            if now < self._trial_until:
                raise LLMUnavailable(state="down", reason=self._reason, retry_after_sec=5)
            self._trial_until = now + self.TRIAL_LEASE_SEC

    # ---- 疎通確認（/health から。利用者の質問を待たずに復旧・故障を検知する）----
    def refresh(self) -> None:
        if self._probe_fn is None:
            return
        with self._lock:
            if self._forced:
                return
            now = self._now()
            if self._state == "down":
                due = now >= self._down_until and now - self._last_probe >= 5.0
            else:
                due = now - self._last_probe >= self.probe_ttl_sec
            if not due:
                return
            self._last_probe = now
        ok, reason = self._probe_fn()  # ロックの外で（最大数秒かかる）
        if ok:
            self.record_success()
        else:
            self.record_failure(f"疎通確認に失敗: {reason}")

    def snapshot(self, *, probe: bool = False) -> dict[str, Any]:
        if probe:
            self.refresh()
        with self._lock:
            now = self._now()
            if self._forced:
                return {
                    "ok": False,
                    "state": "maintenance",
                    "message": self._forced_message or FORCED_DEFAULT_MESSAGE,
                    "reason": "manual",
                    "since": None,
                    "retry_after_sec": 60,
                }
            if self._state == "down":
                return {
                    "ok": False,
                    "state": "down",
                    "message": DEFAULT_MESSAGE,
                    "reason": self._reason,
                    "since": _utc_iso(self._since) if self._since else None,
                    "retry_after_sec": max(1, int(self._down_until - now)),
                }
            return {
                "ok": True,  # ok / unknown（落ちていると分かっていない）。画面にメンテナンス表示を出さない
                "state": self._state,
                "message": None,
                "reason": None,
                "since": None,
                "retry_after_sec": 0,
            }
