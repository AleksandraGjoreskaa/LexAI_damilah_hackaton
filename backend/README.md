# LexAI Backend

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and adjust values if needed:
```bash
cp .env.example .env
```

## Running

```bash
python run.py
```

The API will be available at `http://localhost:8000`  
Swagger docs at `http://localhost:8000/docs`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/pdf/upload` | Upload a PDF file |
| GET | `/api/v1/pdf/documents` | List all uploaded documents |
| DELETE | `/api/v1/pdf/documents/{id}` | Delete a document |
| POST | `/api/v1/pdf/search` | Semantic search across documents |

## Architecture

1. **PDF Upload** → File saved to disk + metadata in SQLite
2. **Text Extraction** → pdfplumber extracts text page by page
3. **Chunking** → LangChain RecursiveCharacterTextSplitter splits into overlapping chunks
4. **Embedding** → multilingual-e5-base converts chunks to vectors (strong Macedonian support)
5. **Storage** → ChromaDB persists vectors with metadata (source file, page number)
6. **Search** → Semantic similarity search returns relevant law article chunks
