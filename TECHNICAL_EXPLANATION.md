# 🧑‍💻 LexAI — Technical Explanation (Junior Engineer Level)

## What Does This App Do?

LexAI is a **legal assistant chatbot** for Macedonian law. You ask it a question in Macedonian (like "Што е договор за продажба?") and it:

1. Searches through 30+ Macedonian laws to find relevant sections
2. Sends those sections + your question to GPT-4o
3. Returns a precise answer citing specific law articles

This is called **RAG** — Retrieval-Augmented Generation.

---

## The Full Pipeline (Step by Step)

### Step 1: Getting the Data (Web Scraping)

**File:** `backend/scripts/scrape_laws.py`

**What it does:** Goes to the Ministry of Justice website (pravda.gov.mk), finds all PDF links, and downloads the law documents.

**How it works:**
```python
# 1. Fetch the webpage HTML
response = requests.get("https://www.pravda.gov.mk/mk-MK/regulativa/zakoni")

# 2. Parse the HTML to find PDF links
soup = BeautifulSoup(response.text, "html.parser")
pdf_links = soup.find_all("a", href=lambda h: h and h.endswith(".pdf"))

# 3. Download each PDF
for link in pdf_links:
    pdf_url = link["href"]
    pdf_content = requests.get(pdf_url).content
    # Save to disk...
```

**Libraries used:**
- `requests` — makes HTTP calls to download web pages and files
- `BeautifulSoup4` — parses HTML to extract specific elements (links, text, etc.)

---

### Step 2: Extracting Text from PDFs

**File:** `backend/app/services/pdf_processor.py`

**What it does:** Opens each PDF and pulls out the text content, page by page.

**How it works:**
```python
import pdfplumber

with pdfplumber.open("law.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()  # Gets all text from this page
```

**Why pdfplumber?** It's one of the best libraries for extracting text from PDFs. It handles complex layouts, tables, and multi-column documents well.

**Problem we hit:** Some government PDFs are "scanned images" — they look like text but are actually pictures. pdfplumber can't read images, only real text. Also, some PDFs had broken font encoding (the characters map to wrong letters). We added a quality filter to detect and skip garbled text:

```python
def _is_garbled(text):
    # Macedonian text should be mostly Cyrillic
    cyrillic_count = count_cyrillic_characters(text)
    total_letters = count_all_letters(text)
    # If less than 30% is Cyrillic, it's probably garbled
    return (cyrillic_count / total_letters) < 0.30
```

---

### Step 3: Chunking (Breaking Text Into Pieces)

**Why chunk?** A law document can be 280 pages long. You can't send the entire thing to GPT-4o (it has a context limit). So we break it into small pieces (~1000 characters each).

**How it works:**
```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,       # Each piece is ~1000 chars
    chunk_overlap=200,     # 200 chars overlap between pieces (so we don't cut sentences)
    separators=["\n\n", "\n", ".", ";", ",", " "]  # Try to break at natural points
)

chunks = splitter.split_text(long_text)
# Result: ["Член 442 (1) Со договорот за продажба...", "...предметот на купувачот..."]
```

The `chunk_overlap=200` is important — without it, a sentence could be split in half between two chunks, losing meaning.

---

### Step 4: Creating Embeddings (The Magic Part)

**What are embeddings?** Think of them as "coordinates in meaning space." Each text chunk gets converted into a list of 768 numbers (a vector) that represents its *meaning*. Similar texts get similar vectors.

**Model used:** `intfloat/multilingual-e5-base`

**Why this model?**
- Supports 100+ languages including Macedonian (many models only work for English)
- "e5" stands for "EmbEddings from bidirEctional Encoder rEpresentations" 
- Trained specifically for search/retrieval tasks
- Requires special prefixes: `"passage: "` for documents, `"query: "` for search queries

```python
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="intfloat/multilingual-e5-base",
    encode_kwargs={"normalize_embeddings": True}  # Makes cosine similarity work properly
)

# Convert text to vector:
vector = embeddings.embed_query("query: договор за продажба")
# Result: [0.023, -0.156, 0.089, ...] (768 numbers)
```

**`normalize_embeddings=True`**: This makes all vectors have length 1.0, which means we can use dot product instead of full cosine similarity — faster computation, same results.

---

### Step 5: Storing in ChromaDB (Vector Database)

**File:** `backend/app/services/vector_store.py`

**What is ChromaDB?** A database designed for storing and searching vectors. Unlike a normal SQL database that finds exact matches (WHERE name = 'X'), a vector DB finds the **most similar** vectors to your query.

```python
from langchain_chroma import Chroma

vector_store = Chroma(
    collection_name="macedonian_laws",
    embedding_function=embeddings,
    persist_directory="./chroma_data"  # Saved to disk (survives restarts)
)

# Adding documents:
vector_store.add_documents(chunks)  # Automatically embeds + stores

# Searching:
results = vector_store.similarity_search_with_relevance_scores(
    "query: договор за продажба",
    k=5  # Return top 5 most similar chunks
)
```

**How similarity search works (Cosine Similarity):**

Imagine every chunk as a point in 768-dimensional space. When you search, your query also becomes a point. ChromaDB finds the 5 nearest points (chunks) to your query point.

The "distance" is measured by **cosine similarity** — the angle between two vectors:
- Score = 1.0 → identical meaning
- Score = 0.8 → very related  
- Score = 0.5 → somewhat related
- Score = 0.0 → completely unrelated

---

### Step 6: RAG — Putting It All Together

**File:** `backend/app/services/llm_service.py`

When a user asks a question, this happens:

```
User: "Што е договор за продажба?"
         │
         ▼
[1] Embed the question → vector
         │
         ▼
[2] Search ChromaDB → find top 5 most similar chunks
         │
         ▼
[3] Build a prompt:
    "Here is context from Macedonian law: [chunk1] [chunk2] [chunk3]..."
    "Question: Што е договор за продажба?"
    "Answer based ONLY on the context above:"
         │
         ▼
[4] Send to GPT-4o → get answer
         │
         ▼
[5] Return answer + sources to user
```

**Why RAG instead of just asking GPT-4o directly?**
- GPT-4o doesn't know Macedonian law (it's not in its training data in detail)
- By giving it the exact law text as context, it can quote specific articles accurately
- We can cite sources (show which law/article the answer came from)
- No hallucination — it can only answer based on what we give it

---

### Step 7: The Backend API (FastAPI)

**File:** `backend/app/api/routes/chat.py`

FastAPI exposes HTTP endpoints:

```python
@router.post("/ask")        # Regular request → returns full answer
@router.post("/ask/stream") # Streaming → returns answer token-by-token (SSE)
```

**Streaming (Server-Sent Events):**
Instead of waiting 8 seconds for the full answer, we stream each word as GPT-4o generates it:

```python
# Backend sends events like:
data: {"type": "sources", "sources": [...], "confidence": 0.79}
data: {"type": "token", "content": "Според"}
data: {"type": "token", "content": " член"}
data: {"type": "token", "content": " 442"}
data: {"type": "done"}
```

The frontend reads these events and appends each token to the display — creating the "typing" effect you see in ChatGPT.

---

### Step 8: The Frontend (React + TypeScript)

**Pages:**
- `ChatPage.tsx` — Chat interface with streaming, markdown rendering, collapsible sources, follow-up questions, copy/export buttons
- `SearchPage.tsx` — Direct semantic search with text highlighting
- `DocumentsPage.tsx` — Upload/manage PDFs with stats

**Key libraries:**
- `react-markdown` — renders **bold**, lists, headers from LLM output
- `html2pdf.js` — generates downloadable PDF files from answers
- `lucide-react` — icons
- `tailwindcss` — utility-first CSS with dark mode support (class strategy)

**UX Features:**
- **Dark mode** — Toggle in sidebar, persisted in localStorage, applied via Tailwind `dark:` variants
- **Share/Export** — Each assistant message has Copy (clipboard) and Download PDF buttons (appear on hover)
- **Follow-up questions** — AI suggests 3 related questions after each answer

---

## Summary: Technology Choices

| Decision | Choice | Why |
|----------|--------|-----|
| Embedding model | multilingual-e5-base | Best multilingual support for Slavic languages |
| Vector DB | ChromaDB | Simple, local, no setup needed, persistent |
| LLM | GPT-4o | Best at following instructions + multilingual |
| PDF extraction | pdfplumber | Handles complex PDFs, tables, multi-column |
| Text splitting | RecursiveCharacterTextSplitter | Smart splitting at sentence boundaries |
| Backend | FastAPI | Async, fast, automatic OpenAPI docs |
| Frontend | React + Vite | Fast development, hot reload |
| Scraping | BeautifulSoup4 | Standard, reliable HTML parsing |
| Similarity metric | Cosine similarity | Standard for normalized embeddings |
| Streaming | SSE (Server-Sent Events) | Simple, no WebSocket needed, works with fetch() |

---

## How To Run It

```bash
# Backend
cd backend
.\venv\Scripts\Activate.ps1
py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend
cd frontend
npm run dev
# Open http://localhost:5173

# Scrape more laws (optional)
cd backend
.\venv\Scripts\Activate.ps1
py -m scripts.scrape_laws
```

---

## Key Concepts Cheat Sheet

| Term | Plain English |
|------|--------------|
| **RAG** | Search for relevant info → feed it to LLM → get accurate answer |
| **Embedding** | Converting text into numbers that capture its meaning |
| **Vector** | A list of numbers representing a piece of text |
| **Cosine similarity** | How "similar" two vectors are (1.0 = identical, 0.0 = unrelated) |
| **Chunk** | A small piece (~1000 chars) of a larger document |
| **SSE** | Server sends data piece by piece (like a live stream) |
| **ChromaDB** | Database that stores vectors and finds nearest neighbors |
| **pdfplumber** | Library that reads text from PDF files |
| **Token** | A word-piece that LLMs process (roughly ¾ of a word) |
