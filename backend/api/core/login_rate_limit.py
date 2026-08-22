"""ログイン試行のレート制限（ブルートフォース対策）。

外部依存なしのインメモリ実装。
- 同一 (メールアドレス, クライアントIP) で MAX_ATTEMPTS 回連続で失敗すると
  LOCKOUT_SECONDS の間ロックする。
- 成功するとカウントはリセットされる。

制限事項:
- ワーカープロセスごとに独立したカウンタを持つため、uvicorn --workers 4 の
  本番構成では実効上限が最大4倍まで緩む。それでも無制限よりは大幅に安全。
  厳密にしたい場合は Redis 等の共有ストアに置き換えること。
"""
import time
from threading import Lock

MAX_ATTEMPTS = 5          # この回数連続で失敗したらロック
WINDOW_SECONDS = 15 * 60  # 失敗カウントの有効期間
LOCKOUT_SECONDS = 15 * 60 # ロック時間

_lock = Lock()
# key -> (fail_count, first_failure_ts, locked_until_ts)
_attempts: dict[str, tuple[int, float, float]] = {}


def _key(email: str, client_ip: str) -> str:
    return f"{email.strip().lower()}|{client_ip}"


def _cleanup(now: float) -> None:
    """期限切れエントリを間引く（呼び出しのついでに実行）。"""
    if len(_attempts) < 1000:
        return
    expired = [
        k for k, (_, first_ts, locked_until) in _attempts.items()
        if now - first_ts > WINDOW_SECONDS and now > locked_until
    ]
    for k in expired:
        _attempts.pop(k, None)


def seconds_until_unlock(email: str, client_ip: str) -> int:
    """ロック中なら残り秒数、そうでなければ 0 を返す。"""
    now = time.monotonic()
    with _lock:
        entry = _attempts.get(_key(email, client_ip))
        if not entry:
            return 0
        _, _, locked_until = entry
        remaining = locked_until - now
        return int(remaining) + 1 if remaining > 0 else 0


def record_failure(email: str, client_ip: str) -> None:
    """ログイン失敗を記録し、閾値を超えたらロックを開始する。"""
    now = time.monotonic()
    key = _key(email, client_ip)
    with _lock:
        _cleanup(now)
        count, first_ts, locked_until = _attempts.get(key, (0, now, 0.0))
        # ウィンドウを過ぎた古い失敗はリセット
        if now - first_ts > WINDOW_SECONDS:
            count, first_ts = 0, now
        count += 1
        if count >= MAX_ATTEMPTS:
            locked_until = now + LOCKOUT_SECONDS
        _attempts[key] = (count, first_ts, locked_until)


def record_success(email: str, client_ip: str) -> None:
    """ログイン成功時にカウントをリセットする。"""
    with _lock:
        _attempts.pop(_key(email, client_ip), None)
