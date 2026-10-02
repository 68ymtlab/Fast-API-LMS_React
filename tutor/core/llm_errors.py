"""LLM（学内の AI サーバー）が使えないことの判定と、1回の質問をその場で打ち切る仕組み。 [LMS port]

背景: 研究側のコードは、LLM 呼び出しの失敗を握りつぶして処理を続ける（補助の呼び出しは失敗しても対話を続ける）。
LLM が応答しないと、1回の質問の中で何度もタイムアウトを待つことになり、数分かかる。さらに回答生成の失敗は
「[エラー] 回答生成に失敗しました: ...」という文字列が、そのままチューターの返答として学生に表示されていた。
→ 「LLM に繋がらない・応答しない」原因の失敗だけは、握りつぶさずに質問全体を打ち切る（LLMDownAbort）。
   打ち切りは app/main.py の llm_guard が受け取り、学生には「メンテナンス中」（503）を返し、以降しばらく即座に断る。
"""
from __future__ import annotations

import re
import socket
import urllib.error

try:  # openai は tutor の依存。無い環境でも import できるようにする
    import openai
except ImportError:  # pragma: no cover
    openai = None  # type: ignore[assignment]


class LLMDownAbort(BaseException):
    """LLM が使えないため、この質問の処理を打ち切る。

    BaseException にしているのは、研究側のコードの `except Exception:`（失敗を握りつぶして続ける）に
    捕まらずに、最上位（app/main.py の llm_guard）まで届かせるため。利用者向けの 503 に変換されるので、外には漏れない。
    """


# _http_json_post（urllib）が、HTTP エラーを RuntimeError("<url> -> 502: ...") にして投げる
_HTTP_STATUS_RE = re.compile(r"-> (\d{3}):")
# 「LLM が使えない」とみなす HTTP ステータス: ゲートウェイ・サーバーの不調(5xx)、混雑(429)、認証・設定の誤り(401/403/404)
_UNAVAILABLE_STATUSES = {401, 403, 404, 408, 429}


def _chain(exc: BaseException, limit: int = 8):
    seen = 0
    while exc is not None and seen < limit:
        yield exc
        exc = exc.__cause__ or exc.__context__
        seen += 1


def is_llm_unavailable(exc: BaseException) -> bool:
    """例外（とその原因の連鎖）が「LLM・埋め込み・リランカーのサーバーに繋がらない／応答しない／不調」を表すか。"""
    for e in _chain(exc):
        if isinstance(e, LLMDownAbort):
            return True
        if openai is not None and isinstance(
            e,
            (
                openai.APIConnectionError,  # 接続できない（APITimeoutError も含む）
                openai.InternalServerError,  # 5xx
                openai.RateLimitError,  # 429
                openai.AuthenticationError,  # 401
                openai.PermissionDeniedError,  # 403
                openai.NotFoundError,  # 404（モデル名の誤りなど）
            ),
        ):
            return True
        if isinstance(e, urllib.error.HTTPError):
            if e.code >= 500 or e.code in _UNAVAILABLE_STATUSES:
                return True
            continue
        if isinstance(e, (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError)):
            return True
        if isinstance(e, RuntimeError):
            m = _HTTP_STATUS_RE.search(str(e))
            if m and (int(m.group(1)) >= 500 or int(m.group(1)) in _UNAVAILABLE_STATUSES):
                return True
    return False


def describe(exc: BaseException) -> str:
    """ログ・管理画面用の短い説明（利用者には見せない）。"""
    return f"{type(exc).__name__}: {str(exc)[:160]}"


def is_timeout(exc: BaseException) -> bool:
    """読み取り・接続のタイムアウトか（サーバーが落ちているとは限らず、遅いだけの可能性がある）。"""
    for e in _chain(exc):
        if isinstance(e, (TimeoutError, socket.timeout)):
            return True
        if openai is not None and isinstance(e, openai.APITimeoutError):
            return True
    return False


def abort_if_llm_down(exc: BaseException, *, ignore_timeouts: bool = False) -> None:
    """`except Exception as e:` の先頭で呼ぶ。LLM が使えない原因なら、握りつぶさずに質問全体を打ち切る。

    ignore_timeouts=True: タイムアウトでは打ち切らない。短いタイムアウトを持つ「補助」の呼び出し（プランナーなど）用。
    遅いだけなら、従来どおり安全な代替に切り替えて続ける。接続できない・サーバーのエラーなら、落ちているので打ち切る。
    """
    if not is_llm_unavailable(exc):
        return
    if ignore_timeouts and is_timeout(exc):
        return
    raise LLMDownAbort(describe(exc)) from exc
