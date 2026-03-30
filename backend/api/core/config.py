from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
  # .envファイルから設定を読み込む
  model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
  
  # JWTの署名に使う秘密鍵
  SECRET_KEY: str
  
  # 署名アルゴリズム
  ALGORITHM: str = "HS256"
  
  # アクセストークンの有効期限
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
  
  # リフレッシュトークンの有効期限
  REFRESH_TOKEN_EXPIRE_MINUTES: int = 30*24*60
  
  # CookieのSecure属性設定
  # 本番(HTTPS)では True。HTTP 運用時は .env で False を明示すること
  COOKIE_SECURE: bool = True

  # Basic認証（Docs）用のユーザー名
  DOCS_USERNAME: str = "admin_docs"

  # Basic認証（Docs）用のパスワード
  DOCS_PASSWORD: str = "password_docs"
  
# アプリケーション全体で使う設定インスタンス
settings = Settings()
