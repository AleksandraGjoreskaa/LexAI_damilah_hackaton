from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "LexAI"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./lexai.db"

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_data"

    # Embedding Model - multilingual-e5-base has strong support for Slavic languages including Macedonian
    EMBEDDING_MODEL: str = "intfloat/multilingual-e5-base"

    # PDF Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    # Chunking
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200

    # LLM Settings (OpenAI-compatible API)
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://models.inference.ai.azure.com"
    LLM_MODEL: str = "gpt-4o"
    LLM_TEMPERATURE: float = 0.3
    LLM_MAX_TOKENS: int = 2048

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Ensure directories exist
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
