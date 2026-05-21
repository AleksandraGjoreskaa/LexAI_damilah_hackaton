import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Scale, ChevronDown, ChevronUp, Sparkles, BookOpen, Gavel, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { askQuestionStream, type ChatResponse, type SourceReference } from '@/api/client';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  confidence?: number;
  isStreaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  { icon: Gavel, text: 'Што е договор за продажба?' },
  { icon: BookOpen, text: 'Кои се правата на потрошувачите?' },
  { icon: FileText, text: 'Што предвидува Законот за парнична постапка?' },
  { icon: Scale, text: 'Кои се основните права на работниците?' },
];

function SourcesPanel({ sources, confidence }: { sources: ChatResponse['sources']; confidence?: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>{sources.length} извор{sources.length > 1 ? 'и' : ''}</span>
        {confidence !== undefined && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[10px] font-semibold">
            {(confidence * 100).toFixed(0)}% доверба
          </span>
        )}
        {isOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {isOpen && (
        <div className="mt-2 space-y-1.5 animate-fade-in">
          {sources.map((src, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <FileText className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="font-medium text-gray-700 block truncate">{src.filename}</span>
                {src.snippet && (
                  <span className="text-gray-500 line-clamp-2 mt-0.5">{src.snippet}</span>
                )}
              </div>
              <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">
                {(src.relevance_score * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent, questionOverride?: string) => {
    e?.preventDefault();
    const question = questionOverride || input.trim();
    if (!question || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    try {
      await askQuestionStream(question, (event) => {
        switch (event.type) {
          case 'sources':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, sources: event.sources, confidence: event.confidence }
                  : m
              )
            );
            break;
          case 'token':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + (event.content || '') }
                  : m
              )
            );
            break;
          case 'done':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            );
            break;
          case 'error':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: event.content || 'Настана грешка.', isStreaming: false }
                  : m
              )
            );
            break;
        }
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: err instanceof Error ? err.message : 'Настана грешка. Обидете се повторно.',
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSuggestion = (text: string) => {
    handleSubmit(undefined, text);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-primary-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Правен AI Асистент</h2>
            <p className="text-sm text-gray-500 text-center max-w-md mb-8">
              Поставете прашање за македонските закони. Одговорите се базирани на 30 закони
              вчитани од Министерство за правда.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTED_QUESTIONS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  onClick={() => handleSuggestion(text)}
                  className="flex items-start gap-3 text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm transition-all duration-150 group"
                >
                  <Icon className="h-4 w-4 text-gray-400 group-hover:text-primary-500 mt-0.5 flex-shrink-0 transition-colors" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className="animate-slide-up">
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 bg-primary-600 text-white shadow-sm">
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                      <Scale className="h-4 w-4 text-primary-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
                        <div className="prose prose-sm prose-gray max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&_strong]:text-gray-900 [&_li]:text-gray-700">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.sources && msg.sources.length > 0 && (
                          <SourcesPanel sources={msg.sources} confidence={msg.confidence} />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="flex gap-3 animate-fade-in">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Scale className="h-4 w-4 text-primary-700" />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-md px-4 py-4 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-gray-400 ml-2">Пребарувам закони...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-center">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Поставете правно прашање..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white transition-all placeholder:text-gray-400"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow-md active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            LexAI може да греши. Проверете ги информациите со оригиналните закони.
          </p>
        </form>
      </div>
    </div>
  );
}
