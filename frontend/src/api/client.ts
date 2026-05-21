const API_BASE = '/api/v1';

export interface SourceReference {
  filename: string;
  page_number: number | null;
  relevance_score: number;
  snippet: string;
}

export interface ChatResponse {
  question: string;
  answer: string;
  sources: SourceReference[];
  confidence: number;
}

export interface Document {
  id: number;
  filename: string;
  page_count: number;
  chunk_count: number;
  uploaded_at: string;
  status: string;
}

export interface SearchResult {
  content: string;
  source_filename: string;
  page_number: number | null;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export async function askQuestion(question: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Грешка при комуникација со серверот' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface StreamEvent {
  type: 'sources' | 'token' | 'done' | 'error' | 'followups';
  content?: string;
  sources?: SourceReference[];
  confidence?: number;
  questions?: string[];
}

export async function askQuestionStream(
  question: string,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/ask/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Грешка при комуникација со серверот' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // ignore malformed events
        }
      }
    }
  }
}

export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/pdf/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Грешка при прикачување' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getDocuments(): Promise<Document[]> {
  const res = await fetch(`${API_BASE}/pdf/documents`);
  if (!res.ok) throw new Error('Грешка при вчитување документи');
  return res.json();
}

export async function deleteDocument(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/pdf/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Грешка при бришење');
}

export async function searchDocuments(query: string, topK = 5): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/pdf/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error('Грешка при пребарување');
  return res.json();
}
