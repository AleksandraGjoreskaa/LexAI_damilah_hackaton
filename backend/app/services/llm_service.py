from openai import OpenAI

from app.core import settings
from app.services.vector_store import VectorStoreService


SYSTEM_PROMPT = """Ти си LexAI - паметен правен асистент специјализиран за македонско законодавство.

Твоја задача е да одговараш на правни прашања базирано ИСКЛУЧИВО на дадениот контекст од законски текстови.

Правила:
1. Одговарај САМО на македонски јазик.
2. Базирај го одговорот ИСКЛУЧИВО на дадениот контекст. Не измислувај информации.
3. Ако одговорот не може да се најде во контекстот, кажи: "Не можам да најдам одговор на ова прашање во достапните законски текстови."
4. Секогаш наведи го изворот (име на закон и член) од каде е информацијата.
5. Биди прецизен и концизен.
6. Структурирај го одговорот јасно со bullet points кога е потребно.

Формат на одговор:
- Прво дај јасен одговор на прашањето
- Потоа наведи ги релевантните членови како референца
"""


class LLMService:
    """Handles LLM interactions using OpenAI-compatible API for RAG-based legal Q&A."""

    def __init__(self, vector_store: VectorStoreService):
        self.vector_store = vector_store

        if not settings.LLM_API_KEY:
            raise ValueError(
                "LLM_API_KEY is not set. Please add it to your .env file."
            )

        self.client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )

    def _build_context(self, search_results: list[dict]) -> str:
        """Format search results into context string for the LLM."""
        context_parts = []
        for i, result in enumerate(search_results, 1):
            source = result["source_filename"]
            page = result.get("page_number", "N/A")
            content = result["content"]
            context_parts.append(
                f"[Извор {i}: {source}, страна {page}]\n{content}"
            )
        return "\n\n---\n\n".join(context_parts)

    def ask(self, question: str, top_k: int = 5) -> dict:
        """
        Full RAG pipeline:
        1. Search vector store for relevant chunks
        2. Build context from results
        3. Send to LLM for answer generation
        Returns dict with answer, sources, and confidence.
        """
        # Step 1: Retrieve relevant chunks
        search_results = self.vector_store.search(query=question, top_k=top_k)

        if not search_results:
            return {
                "answer": "Не можам да најдам одговор на ова прашање. Нема поставено документи во системот.",
                "sources": [],
                "confidence": 0.0,
            }

        # Step 2: Build context
        context = self._build_context(search_results)

        # Step 3: Generate answer with LLM
        user_prompt = f"""Контекст од македонски закони:

{context}

---

Прашање: {question}

Одговори базирано на горниот контекст:"""

        response = self.client.chat.completions.create(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        answer = response.choices[0].message.content

        # Calculate confidence based on average similarity scores
        avg_score = sum(r["score"] for r in search_results) / len(search_results)
        confidence = min(avg_score, 1.0)

        # Build sources list
        sources = [
            {
                "filename": r["source_filename"],
                "page_number": r.get("page_number"),
                "relevance_score": r["score"],
                "snippet": r["content"][:200] + "..." if len(r["content"]) > 200 else r["content"],
            }
            for r in search_results
        ]

        return {
            "answer": answer,
            "sources": sources,
            "confidence": confidence,
        }

    def ask_stream(self, question: str, top_k: int = 5):
        """
        Streaming RAG pipeline - yields chunks as they arrive.
        First yields sources/metadata as JSON, then streams answer tokens.
        """
        search_results = self.vector_store.search(query=question, top_k=top_k)

        if not search_results:
            yield {
                "type": "sources",
                "sources": [],
                "confidence": 0.0,
            }
            yield {
                "type": "token",
                "content": "Не можам да најдам одговор на ова прашање. Нема поставено документи во системот.",
            }
            yield {"type": "done"}
            return

        context = self._build_context(search_results)

        avg_score = sum(r["score"] for r in search_results) / len(search_results)
        confidence = min(avg_score, 1.0)

        sources = [
            {
                "filename": r["source_filename"],
                "page_number": r.get("page_number"),
                "relevance_score": r["score"],
                "snippet": r["content"][:200] + "..." if len(r["content"]) > 200 else r["content"],
            }
            for r in search_results
        ]

        # Yield sources first so frontend can display them immediately
        yield {
            "type": "sources",
            "sources": sources,
            "confidence": confidence,
        }

        user_prompt = f"""Контекст од македонски закони:

{context}

---

Прашање: {question}

Одговори базирано на горниот контекст:"""

        stream = self.client.chat.completions.create(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield {
                    "type": "token",
                    "content": chunk.choices[0].delta.content,
                }

        yield {"type": "done"}
