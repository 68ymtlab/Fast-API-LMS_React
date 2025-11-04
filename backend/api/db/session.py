from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(
  DATABASE_URL,
  pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
  engine, 
  class_=AsyncSession, 
  expire_on_commit=False,
  autoflush=False,
  autocommit=False
)

Base = declarative_base()

async def get_db() -> AsyncSession:
  async with AsyncSessionLocal() as session:
    yield session