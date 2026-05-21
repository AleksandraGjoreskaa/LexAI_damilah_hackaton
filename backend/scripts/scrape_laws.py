"""
Scraper for pravda.gov.mk - Downloads and processes Macedonian law PDFs.

Usage:
    cd backend/
    python -m scripts.scrape_laws

This script:
1. Scrapes PDF links from https://www.pravda.gov.mk/mk-MK/regulativa/zakoni
2. Downloads each PDF to the uploads directory
3. Processes through the existing pipeline (extract → chunk → embed → store)
4. Creates database records matching the upload endpoint behavior
"""
import asyncio
import logging
import re
import sys
import uuid
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from sqlalchemy import select

# Add parent to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import settings
from app.db.database import engine, async_session, init_db
from app.db.models import PDFDocument
from app.services.pdf_processor import PDFProcessor
from app.services.vector_store import VectorStoreService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Source URL
SOURCE_URL = "https://www.pravda.gov.mk/mk-MK/regulativa/zakoni"

# HTTP headers to mimic a browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/pdf",
    "Accept-Language": "mk,en;q=0.9",
}

# Timeout for downloads (seconds)
DOWNLOAD_TIMEOUT = 120


def scrape_pdf_links() -> list[dict]:
    """Scrape the pravda.gov.mk page and extract PDF links with their law names."""
    logger.info(f"Fetching page: {SOURCE_URL}")
    response = requests.get(SOURCE_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    pdf_data = []

    for a_tag in soup.find_all("a", href=re.compile(r"\.pdf$", re.IGNORECASE)):
        href = a_tag.get("href", "").strip()
        text = a_tag.get_text(strip=True)

        if not href or not text:
            continue

        # Sanitize the name for use as filename
        safe_name = re.sub(r'[<>:"/\\|?*]', '', text)
        safe_name = safe_name.strip()[:150]  # Limit length

        pdf_data.append({
            "name": text,
            "safe_name": safe_name,
            "url": href,
        })

    logger.info(f"Found {len(pdf_data)} PDF links on the page")
    return pdf_data


def download_pdf(url: str, dest_path: Path) -> bool:
    """Download a PDF file. Returns True on success."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=DOWNLOAD_TIMEOUT, stream=True)
        response.raise_for_status()

        # Verify it's actually a PDF
        content_type = response.headers.get("Content-Type", "")
        if "pdf" not in content_type.lower() and not url.lower().endswith(".pdf"):
            logger.warning(f"Skipping non-PDF content: {content_type} for {url}")
            return False

        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = dest_path.stat().st_size
        if file_size < 1000:  # Less than 1KB is suspicious
            logger.warning(f"Downloaded file suspiciously small ({file_size} bytes): {url}")
            dest_path.unlink()
            return False

        return True

    except requests.RequestException as e:
        logger.error(f"Download failed for {url}: {e}")
        if dest_path.exists():
            dest_path.unlink()
        return False


async def check_already_processed(original_filename: str) -> bool:
    """Check if a document with this name already exists in the DB."""
    async with async_session() as session:
        result = await session.execute(
            select(PDFDocument).where(
                PDFDocument.original_filename == original_filename,
                PDFDocument.status == "completed",
            )
        )
        return result.scalar_one_or_none() is not None


async def save_document_record(
    unique_filename: str,
    original_filename: str,
    file_path: str,
    page_count: int,
    chunk_count: int,
) -> int:
    """Create a completed PDFDocument record in the database."""
    async with async_session() as session:
        record = PDFDocument(
            filename=unique_filename,
            original_filename=original_filename,
            file_path=file_path,
            page_count=page_count,
            chunk_count=chunk_count,
            status="completed",
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return record.id


async def main():
    """Main scraper pipeline."""
    start_time = time.time()

    # Initialize database
    logger.info("Initializing database...")
    await init_db()

    # Initialize services (embedding model loads here - takes a moment)
    logger.info("Loading embedding model (this may take a moment)...")
    pdf_processor = PDFProcessor()
    vector_store = VectorStoreService()
    logger.info("Services ready.")

    # Step 1: Scrape PDF links
    pdf_links = scrape_pdf_links()
    if not pdf_links:
        logger.error("No PDF links found. Page structure may have changed.")
        return

    # Ensure upload directory exists
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Step 2: Process each PDF
    stats = {"downloaded": 0, "skipped": 0, "failed": 0, "total_chunks": 0}

    for i, pdf_info in enumerate(pdf_links, 1):
        name = pdf_info["name"]
        url = pdf_info["url"]
        safe_name = pdf_info["safe_name"]
        original_filename = f"{safe_name}.pdf"

        logger.info(f"\n[{i}/{len(pdf_links)}] Processing: {name}")

        # Check if already in DB
        if await check_already_processed(original_filename):
            logger.info(f"  → Already processed, skipping.")
            stats["skipped"] += 1
            continue

        # Download PDF
        unique_filename = f"{uuid.uuid4().hex}.pdf"
        file_path = upload_dir / unique_filename

        logger.info(f"  → Downloading from: {url}")
        if not download_pdf(url, file_path):
            stats["failed"] += 1
            continue

        file_size_kb = file_path.stat().st_size / 1024
        logger.info(f"  → Downloaded: {file_size_kb:.0f} KB")

        # Process PDF (extract text + chunk)
        try:
            chunks, page_count = pdf_processor.process_pdf(str(file_path), original_filename)

            if not chunks:
                logger.warning(f"  → No text extracted from PDF, skipping.")
                file_path.unlink()
                stats["failed"] += 1
                continue

            logger.info(f"  → Extracted: {page_count} pages, {len(chunks)} chunks")

            # Store in ChromaDB
            vector_store.add_documents(chunks)
            logger.info(f"  → Stored in vector DB")

            # Save DB record
            doc_id = await save_document_record(
                unique_filename=unique_filename,
                original_filename=original_filename,
                file_path=str(file_path),
                page_count=page_count,
                chunk_count=len(chunks),
            )
            logger.info(f"  → DB record created (id={doc_id})")

            stats["downloaded"] += 1
            stats["total_chunks"] += len(chunks)

        except Exception as e:
            logger.error(f"  → Processing failed: {e}")
            if file_path.exists():
                file_path.unlink()
            stats["failed"] += 1

    # Summary
    elapsed = time.time() - start_time
    logger.info(f"\n{'='*60}")
    logger.info(f"SCRAPING COMPLETE in {elapsed:.1f}s")
    logger.info(f"  Downloaded & processed: {stats['downloaded']}")
    logger.info(f"  Skipped (already exist): {stats['skipped']}")
    logger.info(f"  Failed: {stats['failed']}")
    logger.info(f"  Total new chunks added: {stats['total_chunks']}")
    logger.info(f"  Vector store total: {vector_store.get_collection_count()} documents")
    logger.info(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
