from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document

from app.core import settings


class VectorStoreService:
    """
    Manages ChromaDB vector store operations using LangChain.
    Uses multilingual-e5-base for embeddings - strong support for Macedonian/Slavic languages.
    """

    def __init__(self):
        # multilingual-e5-base requires "query: " prefix for queries
        # and "passage: " prefix for documents during embedding
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

        self.vector_store = Chroma(
            collection_name="macedonian_laws",
            embedding_function=self.embeddings,
            persist_directory=settings.CHROMA_PERSIST_DIR,
        )

    def add_documents(self, documents: list[Document]) -> list[str]:
        """
        Add LangChain Document objects to ChromaDB.
        The documents already contain metadata (source, page_number).
        Returns list of document IDs.
        """
        # Prefix each document content with "passage: " for e5 model compatibility
        for doc in documents:
            if not doc.page_content.startswith("passage: "):
                doc.page_content = f"passage: {doc.page_content}"

        ids = self.vector_store.add_documents(documents)
        return ids

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """
        Perform similarity search on the vector store.
        Prefixes query with "query: " for e5 model compatibility.
        Returns list of results with content, metadata, and score.
        """
        # e5 models expect "query: " prefix for search queries
        prefixed_query = f"query: {query}"

        results = self.vector_store.similarity_search_with_relevance_scores(
            prefixed_query, k=top_k
        )

        search_results = []
        for doc, score in results:
            content = doc.page_content
            # Remove the "passage: " prefix for display
            if content.startswith("passage: "):
                content = content[len("passage: "):]

            search_results.append({
                "content": content,
                "source_filename": doc.metadata.get("source", "unknown"),
                "page_number": doc.metadata.get("page_number"),
                "score": float(score),
            })

        return search_results

    def delete_by_source(self, filename: str) -> None:
        """
        Delete all documents from a specific source file.
        """
        self.vector_store._collection.delete(
            where={"source": filename}
        )

    def get_collection_count(self) -> int:
        """Get total number of documents in the collection."""
        return self.vector_store._collection.count()
