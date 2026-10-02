"""管理画面の「モデルの選択」のための、起動中のモデルの一覧と、接続テスト。

モデルは頻繁に変わる（vllm-manager で起動・停止する）ので、手書きの候補ではなく、いま起動しているものを自動で取る。
取得元（上から順に試す）:
  1. vllm-manager の /api/instances（管理者の PAT。起動中・healthy なチャットモデルと、停止中のチャットモデル）
  2. vllm-manager の /v1/models（認証なし。起動中のモデルだけが出る。種別は分からないので、埋め込み・リランカーを除く）
  3. LiteLLM ゲートウェイの /v1/models（鍵によっては 401）
  4. 手書きの候補（tutor/.env の TUTOR_MODEL_CHOICES）
別名 vllm-local は「起動中のチャットモデルに自動で合わせる」ための固定の別名（LiteLLM 側の登録）。選ぶと、モデルを入れ替えても名前を直さずに済む。
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any, Callable

ALIAS_ID = "vllm-local"
ALIAS_NOTE = "起動中のチャットモデルに自動で合わせる（別名）。モデルを入れ替えても名前を直さなくてよいが、記録されるモデル名は「vllm-local」になる"

STATE_RUNNING = "running"   # 起動中（healthy）
STATE_STOPPED = "stopped"   # 登録されているが、いまは起動していない
STATE_UNKNOWN = "unknown"   # 起動しているか分からない（取得元が一覧を出さない）
STATE_ALIAS = "alias"


def http_get_json(url: str, token: str | None = None, timeout: float = 6.0) -> Any:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _looks_non_chat(model_id: str) -> bool:
    """名前から、埋め込み・リランカー（チャットに使えない）を除く。種別を返さない取得元（2〜4）の保険。"""
    low = model_id.lower()
    return any(w in low for w in ("embed", "rerank"))


def _norm(base: str) -> str:
    return (base or "").rstrip("/")


def list_models(
    *,
    manager_url: str,
    manager_token: str,
    gateway_url: str,
    gateway_key: str,
    env_choices: list[str],
    current: str,
    exclude_ids: set[str],
    fetch: Callable[..., Any] = http_get_json,
) -> dict[str, Any]:
    """選べるモデルの一覧を返す。items: [{id, state, note}]、source: 取得元、error: 取得に失敗した理由（あれば）。"""
    items: dict[str, dict[str, Any]] = {}
    source = "env"
    errors: list[str] = []

    def put(mid: str, state: str, note: str = "") -> None:
        if not mid or mid in exclude_ids or _looks_non_chat(mid):
            return
        prev = items.get(mid)
        # 起動中は、他の取得元より優先する
        if prev and prev["state"] == STATE_RUNNING:
            return
        items[mid] = {"id": mid, "state": state, "note": note}

    # 1) vllm-manager /api/instances（種別つき）
    got = False
    if manager_url and manager_token:
        try:
            instances = fetch(_norm(manager_url) + "/api/instances", manager_token)
            for inst in instances if isinstance(instances, list) else []:
                if inst.get("task_type") != "chat":
                    continue
                mid = str(inst.get("model_id") or inst.get("model") or "")
                if inst.get("running") and inst.get("healthy"):
                    put(mid, STATE_RUNNING)
                elif mid not in items:
                    put(mid, STATE_STOPPED)
            got = True
            source = "manager"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"vllm-manager /api/instances: {type(exc).__name__}: {str(exc)[:80]}")
    # 2) vllm-manager /v1/models（認証なし。起動中のみ）
    if not got and manager_url:
        try:
            data = fetch(_norm(manager_url) + "/v1/models", None)
            for m in (data or {}).get("data", []):
                put(str(m.get("id") or ""), STATE_RUNNING)
            got = True
            source = "manager-open"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"vllm-manager /v1/models: {type(exc).__name__}: {str(exc)[:80]}")
    # 3) LiteLLM /v1/models
    if not got and gateway_url:
        try:
            data = fetch(_norm(gateway_url) + "/v1/models", gateway_key)
            for m in (data or {}).get("data", []):
                put(str(m.get("id") or ""), STATE_UNKNOWN, "ゲートウェイに登録されている名前（起動しているかは不明）")
            got = True
            source = "gateway"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"LiteLLM /v1/models: {type(exc).__name__}: {str(exc)[:80]}")
    # 4) 手書きの候補（取得元に無いものを、不明として足す）
    for mid in env_choices:
        if mid and mid not in items:
            put(mid, STATE_UNKNOWN if got is False else STATE_STOPPED, "tutor/.env の候補（起動しているかは未確認）" if got is False else "起動していません")
    # いま使っているモデルは、必ず一覧に入れる（画面で選択済みとして表示できるように）
    if current and current not in items and current != ALIAS_ID:
        put(current, STATE_STOPPED if got else STATE_UNKNOWN, "現在の設定（起動しているモデルの中にありません）" if got else "現在の設定")

    order = {STATE_RUNNING: 0, STATE_UNKNOWN: 1, STATE_STOPPED: 2}
    ordered = sorted(items.values(), key=lambda it: (order.get(it["state"], 3), it["id"]))
    ordered.append({"id": ALIAS_ID, "state": STATE_ALIAS, "note": ALIAS_NOTE})
    return {"items": ordered, "source": source, "error": "; ".join(errors) or None}


def test_model(
    model: str,
    *,
    client_factory: Callable[[], Any],
    extra_body: dict[str, Any],
    now_fn: Callable[[], float] = time.time,
) -> dict[str, Any]:
    """選んだモデルで、短い質問を1回だけ、tutor が実際に使う経路（ストリーム呼び出し）で行う。"""
    import openai

    t0 = now_fn()
    try:
        client = client_factory()
        stream = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "日本語で一言、こんにちは。"}],
            temperature=0.0,
            max_tokens=48,
            stream=True,
            extra_body=extra_body,
        )
        parts: list[str] = []
        for chunk in stream:
            if not chunk.choices:
                continue
            c = getattr(chunk.choices[0].delta, "content", None)
            if c:
                parts.append(c)
        reply = "".join(parts).strip()
        took = round(now_fn() - t0, 1)
        if not reply:
            return {"ok": False, "kind": "empty", "model": model, "latency_sec": took,
                    "message": "接続はできましたが、返答が空でした（推論の出力だけで終わった、またはモデルの設定の問題）。",
                    "detail": ""}
        return {"ok": True, "model": model, "latency_sec": took, "reply": reply[:200]}
    except openai.NotFoundError as exc:
        return _fail(model, now_fn() - t0, "not_found",
                     "このモデル名は、LiteLLM に登録されていません（モデルが起動していないか、名前が違います）。", exc)
    except (openai.AuthenticationError, openai.PermissionDeniedError) as exc:
        return _fail(model, now_fn() - t0, "auth", "鍵（ANTHROPIC_AUTH_TOKEN）が無効、またはこのモデルを使う権限がありません。", exc)
    except openai.RateLimitError as exc:
        return _fail(model, now_fn() - t0, "busy", "AI サーバーが混み合っています（同時に処理できる数の上限）。少し待ってからもう一度試してください。", exc)
    except openai.APITimeoutError as exc:
        return _fail(model, now_fn() - t0, "timeout", "応答がありません。モデルの起動の途中か、混み合っている可能性があります。", exc)
    except openai.APIConnectionError as exc:
        return _fail(model, now_fn() - t0, "connection", "AI サーバーに接続できません。", exc)
    except openai.InternalServerError as exc:
        return _fail(model, now_fn() - t0, "server_error",
                     "AI サーバーがエラーを返しました。モデルが起動しているか、LiteLLM の設定（ストリーム応答の扱いなど）を確認してください。", exc)
    except openai.BadRequestError as exc:
        return _fail(model, now_fn() - t0, "bad_request", "AI サーバーが、リクエストを受け付けませんでした（文脈長・パラメータなど）。", exc)
    except Exception as exc:  # noqa: BLE001
        return _fail(model, now_fn() - t0, "other", "テストに失敗しました。", exc)


def _fail(model: str, took: float, kind: str, message: str, exc: BaseException) -> dict[str, Any]:
    return {"ok": False, "kind": kind, "model": model, "latency_sec": round(took, 1), "message": message,
            "detail": f"{type(exc).__name__}: {str(exc)[:200]}"}
