import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen } from 'lucide-react';
import { askQuestion, type ChatResponse } from '@/api/client';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatResponse['sources'];
  confidence?: number;
}

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askQuestion(question);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        confidence: response.confidence,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Настана грешка. Обидете се повторно.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-900">Правен разговор</h2>
        <p className="text-sm text-gray-500">Поставете прашање за македонското законодавство</p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BookOpen className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600">Добредојдовте во LexAI</h3>
            <p className="text-sm text-gray-400 mt-2 max-w-md">
              Поставете прашање за македонските закони и регулативи.
              Одговорите се базирани на прикачените правни документи.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-4 py-3',
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              )}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">Извори:</p>
                  <div className="space-y-1">
                    {msg.sources.map((src, i) => (
                      <div key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                        <span className="font-medium">{src.filename}</span>
                        <span className="ml-2 text-gray-400">
                          (релевантност: {(src.relevance_score * 100).toFixed(0)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                  {msg.confidence !== undefined && (
                    <p className="text-xs text-gray-400 mt-2">
                      Доверба: {(msg.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишете го вашето прашање..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-primary-600 px-4 py-3 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
