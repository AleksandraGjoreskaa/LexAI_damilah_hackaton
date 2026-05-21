import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import settings
from app.db.database import init_db
from app.api.routes.pdf import router as pdf_router
from app.api.routes.chat import router as chat_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database initialized.")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Македонски AI Правен Асистент - PDF Processing & RAG Pipeline",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS - allow frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(pdf_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "description": "Македонски AI Правен Асистент",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
