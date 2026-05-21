import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import PDFDocument
from app.models.schemas import (
    PDFUploadResponse,
    PDFListItem,
    PDFDeleteResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.services.pdf_processor import PDFProcessor
from app.services.vector_store import VectorStoreService
from app.core import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdf", tags=["PDF Management"])

# Initialize services
pdf_processor = PDFProcessor()
vector_store_service = VectorStoreService()

ALLOWED_CONTENT_TYPES = ["application/pdf"]


@router.post("/upload", response_model=PDFUploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF file, extract text, chunk it, and store in ChromaDB.
    """
    # Validate file type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed.",
        )

    # Validate file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)

    if file_size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE_MB}MB.",
        )

    # Generate unique filename to avoid collisions
    file_extension = Path(file.filename).suffix
    unique_filename = f"{uuid.uuid4().hex}{file_extension}"
    file_path = Path(settings.UPLOAD_DIR) / unique_filename

    # Save file to disk
    file_path.write_bytes(content)

    # Create database record
    pdf_record = PDFDocument(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=str(file_path),
        status="processing",
    )
    db.add(pdf_record)
    await db.commit()
    await db.refresh(pdf_record)

    try:
        # Process PDF: extract text and chunk
        chunks, page_count = pdf_processor.process_pdf(
            str(file_path), file.filename
        )

        # Store chunks in ChromaDB
        vector_store_service.add_documents(chunks)

        # Update database record
        pdf_record.page_count = page_count
        pdf_record.chunk_count = len(chunks)
        pdf_record.status = "completed"
        await db.commit()
        await db.refresh(pdf_record)

        return PDFUploadResponse(
            id=pdf_record.id,
            filename=file.filename,
            page_count=page_count,
            chunk_count=len(chunks),
            status="completed",
            message=f"Successfully processed '{file.filename}': {page_count} pages, {len(chunks)} chunks stored.",
        )

    except Exception as e:
        logger.error(f"Error processing PDF '{file.filename}': {e}")
        pdf_record.status = "failed"
        pdf_record.error_message = str(e)
        await db.commit()

        # Clean up the uploaded file on failure
        if file_path.exists():
            file_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {str(e)}",
        )


@router.get("/documents", response_model=list[PDFListItem])
async def list_documents(db: AsyncSession = Depends(get_db)):
    """List all uploaded PDF documents."""
    result = await db.execute(
        select(PDFDocument).order_by(PDFDocument.uploaded_at.desc())
    )
    documents = result.scalars().all()
    return documents


@router.delete("/documents/{document_id}", response_model=PDFDeleteResponse)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a PDF document and its vectors from ChromaDB."""
    result = await db.execute(
        select(PDFDocument).where(PDFDocument.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove vectors from ChromaDB
    try:
        vector_store_service.delete_by_source(document.original_filename)
    except Exception as e:
        logger.warning(f"Failed to delete vectors for '{document.original_filename}': {e}")

    # Remove file from disk
    file_path = Path(document.file_path)
    if file_path.exists():
        file_path.unlink()

    # Remove database record
    await db.delete(document)
    await db.commit()

    return PDFDeleteResponse(
        message="Document deleted successfully.",
        filename=document.original_filename,
    )


@router.post("/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """
    Search through stored law documents using semantic similarity.
    This endpoint will be used by the RAG pipeline later.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    results = vector_store_service.search(
        query=request.query,
        top_k=request.top_k,
    )

    return SearchResponse(
        query=request.query,
        results=[SearchResult(**r) for r in results],
    )
