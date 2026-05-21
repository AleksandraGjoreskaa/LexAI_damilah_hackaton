from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PDFUploadResponse(BaseModel):
    id: int
    filename: str
    page_count: int
    chunk_count: int
    status: str
    message: str


class PDFListItem(BaseModel):
    id: int
    filename: str
    page_count: int
    chunk_count: int
    uploaded_at: datetime
    status: str

    class Config:
        from_attributes = True


class PDFDeleteResponse(BaseModel):
    message: str
    filename: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class SearchResult(BaseModel):
    content: str
    source_filename: str
    page_number: Optional[int] = None
    score: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


class ChatRequest(BaseModel):
    question: str
    top_k: int = 5


class SourceReference(BaseModel):
    filename: str
    page_number: Optional[int] = None
    relevance_score: float
    snippet: str


class ChatResponse(BaseModel):
    question: str
    answer: str
    sources: list[SourceReference]
    confidence: float
