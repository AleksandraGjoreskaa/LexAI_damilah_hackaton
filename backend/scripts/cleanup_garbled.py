"""
Cleanup script: removes garbled/unreadable chunks from ChromaDB.
Detects chunks where the text has too many non-standard characters
(broken font encoding from some government PDFs).
"""
import sys
import re
import os

# Ensure we're running from the backend directory
os.chdir(r"c:\Users\ViktorSaveski\LexAI\LexAI_damilah_hackaton\backend")
sys.path.insert(0, r"c:\Users\ViktorSaveski\LexAI\LexAI_damilah_hackaton\backend")

from app.services.vector_store import VectorStoreService


def is_garbled(text: str) -> bool:
    """
    Detect garbled text from PDFs with broken font encoding.
    For Macedonian law documents, legitimate text should be mostly Cyrillic.
    Garbled text often uses Latin characters in nonsensical patterns.
    """
    if not text:
        return True
    # Remove the "passage: " prefix if present
    if text.startswith("passage: "):
        text = text[len("passage: "):]
    if len(text) < 50:
        return False  # too short to judge

    # Count Cyrillic characters (Macedonian text should be mostly Cyrillic)
    cyrillic = len(re.findall(r'[\u0400-\u04FF]', text))
    # Count total alphabetic characters
    alpha = len(re.findall(r'[a-zA-Z\u0400-\u04FF]', text))

    if alpha == 0:
        return True

    # Macedonian legal text should have at least 40% Cyrillic among all letters
    # (some may have article numbers, latin abbreviations, etc.)
    cyrillic_ratio = cyrillic / alpha

    # Also check for excessive brackets/special chars (sign of garbled CID mapping)
    bracket_chars = len(re.findall(r'[\[\]<>{}|◊©®™­]', text))
    bracket_ratio = bracket_chars / len(text) if len(text) > 0 else 0

    return cyrillic_ratio < 0.30 or bracket_ratio > 0.05


def main():
    vs = VectorStoreService()
    # Access the underlying Chroma collection directly
    collection = vs.vector_store._collection

    print(f"Total documents in collection: {collection.count()}")

    # Get all documents in batches
    batch_size = 500
    total = collection.count()
    garbled_ids = []

    for offset in range(0, total, batch_size):
        results = collection.get(
            limit=batch_size,
            offset=offset,
            include=["documents", "metadatas"]
        )

        for doc_id, doc_text, metadata in zip(results["ids"], results["documents"], results["metadatas"]):
            if is_garbled(doc_text):
                source = metadata.get("source", "unknown") if metadata else "unknown"
                garbled_ids.append((doc_id, source, doc_text[:80]))

    print(f"\nFound {len(garbled_ids)} garbled chunks to remove:")

    # Group by source
    sources = {}
    for doc_id, source, preview in garbled_ids:
        sources.setdefault(source, []).append(doc_id)

    for source, ids in sources.items():
        print(f"  - {source}: {len(ids)} garbled chunks")

    if not garbled_ids:
        print("No garbled chunks found. Database is clean!")
        return

    # Delete garbled chunks
    ids_to_delete = [gid for gid, _, _ in garbled_ids]
    print(f"\nDeleting {len(ids_to_delete)} garbled chunks...")

    # ChromaDB delete in batches
    for i in range(0, len(ids_to_delete), 100):
        batch = ids_to_delete[i:i+100]
        collection.delete(ids=batch)

    print(f"Done! Remaining documents: {collection.count()}")


if __name__ == "__main__":
    main()
