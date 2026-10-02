"""リクエスト元のクライアントIPを決める（ログイン試行制限のキーに使う）。

構成: ブラウザ → nginx → (frontend の NextAuth →) backend

- nginx は X-Forwarded-For を「nginx が実際に見たクライアントIP 1個」で上書きする（nginx/nginx.conf）。
  クライアントが偽の X-Forwarded-For を付けても、nginx を通った時点で捨てられる。
- NextAuth（frontend）は、ログイン時に nginx から受け取った X-Forwarded-For をそのまま backend に転送する。
- それでも念のため、複数の値が入っていたら**一番右**（直前の信頼できる中継が付けた値）を使う。
  左側の値はクライアントが自由に書けるので信用しない。
- 値が IP アドレスの形でなければ使わず、TCP の接続元（client_host）にフォールバックする。
  （カウンタのキーに任意の文字列が入って、メモリを増やされるのを防ぐ）
"""
import ipaddress
from typing import Mapping, Optional


def get_client_ip(headers: Mapping[str, str], client_host: Optional[str]) -> str:
    forwarded = headers.get("x-forwarded-for", "")
    if forwarded:
        candidate = forwarded.split(",")[-1].strip()
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            pass
    return client_host or "unknown"
