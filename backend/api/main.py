import secrets
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBasic, HTTPBasicCredentials

# DB
from api.db import base

# Config
from api.core.config import settings

# Routers
from api.routers.users_router import users_router
from api.routers.subjects_router import subjects_router
from api.routers.courses_router import courses_router
from api.routers.lessons_router import lessons_router

app = FastAPI(
    title="Fast-API-LMS_API",
    version="1.0.0",
    description="LMSのバックエンドAPIです。",
    docs_url=None,
    redoc_url=None,
    openapi_url=None 
)

# --- Docs Security (Basic Auth) ---
docs_security = HTTPBasic()

def get_docs_user(credentials: HTTPBasicCredentials = Depends(docs_security)):
    correct_username = secrets.compare_digest(credentials.username, settings.DOCS_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, settings.DOCS_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials for docs",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True

# --- CORS Middleware ---
origins = [
    "http://localhost:8080",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://localhost",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(users_router, prefix="/api")
app.include_router(subjects_router, prefix="/api")
app.include_router(courses_router, prefix="/api")
app.include_router(lessons_router, prefix="/api")
# --- Root Endpoint ---
@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to Fast-API-LMS API"}

# --- Protected Documentation Endpoints ---
docs_dependency = Depends(get_docs_user)

@app.get("/openapi.json", include_in_schema=False, dependencies=[docs_dependency])
async def get_open_api_endpoint():
    return get_openapi(title=app.title, version=app.version, routes=app.routes)

@app.get("/docs", include_in_schema=False, dependencies=[docs_dependency])
async def get_documentation():
    return get_swagger_ui_html(openapi_url="/openapi.json", title="docs")

@app.get("/redoc", include_in_schema=False, dependencies=[docs_dependency])
async def get_redoc_documentation():
    return get_redoc_html(openapi_url="/openapi.json", title="redoc")

