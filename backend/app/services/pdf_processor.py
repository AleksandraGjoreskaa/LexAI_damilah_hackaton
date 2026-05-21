import re

import pdfplumber
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from app.core import settings


class PDFProcessor:
    """Handles PDF text extraction and chunking using LangChain."""

    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ".", ";", ",", " ", ""],
        )

    def extract_text_from_pdf(self, file_path: str) -> list[dict]:
        """
        Extract text from PDF file page by page.
        Returns list of dicts with 'page_number' and 'text' keys.
        """
        pages = []
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        with pdfplumber.open(file_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages.append({
                        "page_number": i + 1,
                        "text": text.strip(),
                    })

        return pages

    def chunk_document(self, pages: list[dict], filename: str) -> list[Document]:
        """
        Split extracted pages into smaller chunks using LangChain's RecursiveCharacterTextSplitter.
        Each chunk carries metadata about source file and page number.
        Filters out garbled/unreadable chunks (broken PDF font encoding).
        """
        documents = []

        for page_data in pages:
            page_docs = self.text_splitter.create_documents(
                texts=[page_data["text"]],
                metadatas=[{
                    "source": filename,
                    "page_number": page_data["page_number"],
                }],
            )
            # Filter out garbled chunks
            for doc in page_docs:
                if not self._is_garbled(doc.page_content):
                    documents.append(doc)

        return documents

    @staticmethod
    def _is_garbled(text: str) -> bool:
        """Detect garbled text from PDFs with broken font encoding."""
        if len(text) < 50:
            return False
        cyrillic = len(re.findall(r'[\u0400-\u04FF]', text))
        alpha = len(re.findall(r'[a-zA-Z\u0400-\u04FF]', text))
        if alpha == 0:
            return True
        cyrillic_ratio = cyrillic / alpha
        bracket_chars = len(re.findall(r'[\[\]<>{}|◊©®™\xad]', text))
        bracket_ratio = bracket_chars / len(text)
        return cyrillic_ratio < 0.30 or bracket_ratio > 0.05

    def process_pdf(self, file_path: str, filename: str) -> tuple[list[Document], int]:
        """
        Full pipeline: extract text from PDF, then chunk it.
        Returns (list of LangChain Documents, page_count).
        """
        pages = self.extract_text_from_pdf(file_path)

        if not pages:
            raise ValueError(f"No text could be extracted from PDF: {filename}")

        chunks = self.chunk_document(pages, filename)
        page_count = len(pages)

        return chunks, page_count
