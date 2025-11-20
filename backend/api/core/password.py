from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class SecurityManager:
    @staticmethod
    def hash_password(password: str) -> str:
        """
        パスワードをハッシュ化
        """
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        パスワードの検証
        """
        return pwd_context.verify(plain_password, hashed_password)
