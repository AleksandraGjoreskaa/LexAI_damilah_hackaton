import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse, SourceReference
from app.services.vector_store import VectorStoreService
from app.services.llm_service import LLMService
from app.core import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat / RAG"])

# Initialize services
vector_store_service = VectorStoreService()

# LLM service initialization (lazy - only if API key is set)
_llm_service = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        if not settings.LLM_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="LLM service not available. LLM_API_KEY is not configured.",
            )
        _llm_service = LLMService(vector_store_service)
    return _llm_service


@router.post("/ask", response_model=ChatResponse)
async def ask_question(request: ChatRequest):
    """
    Ask a legal question. The system will:
    1. Search relevant law chunks via semantic search
    2. Send context + question to Gemini
    3. Return answer with source citations
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    llm_service = get_llm_service()

    try:
        result = llm_service.ask(
            question=request.question,
            top_k=request.top_k,
        )
    except Exception as e:
        logger.error(f"LLM error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating answer: {str(e)}",
        )

    return ChatResponse(
        question=request.question,
        answer=result["answer"],
        sources=[SourceReference(**s) for s in result["sources"]],
        confidence=result["confidence"],
    )
