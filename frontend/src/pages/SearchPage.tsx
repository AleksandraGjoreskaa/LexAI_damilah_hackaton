import { useState } from 'react';
import { Search, FileText, Loader2, BookOpen } from 'lucide-react';
import { searchDocuments, type SearchResult } from '@/api/client';
import { cn } from '@/lib/utils';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await searchDocuments(query.trim(), 10);
      setResults(response.results);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    const words = searchQuery.trim().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return text;

    const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-accent-200 text-accent-900 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header with search */}
      <header className="px-6 py-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Пребарување закони</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Директно пребарување на правната база</p>

          <form onSubmit={handleSearch} className="mt-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Пребарајте поим, член, или правна тема..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white dark:focus:bg-gray-600 transition-all placeholder:text-gray-400"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Пребарај
              </button>
            </div>
          </form>
        </div>
      </header>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-4xl mx-auto">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-primary-400" />
              </div>
              <p className="text-sm text-gray-500 text-center max-w-sm">
                Пребарајте директно во базата од 3,798 правни сегменти.
                Резултатите ги покажуваат најрелевантните делови од законите.
              </p>
            </div>
          ) : isSearching ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-500 mb-3" />
              <p className="text-sm text-gray-500">Пребарувам...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center py-12 animate-fade-in">
              <Search className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-600">Нема резултати</p>
              <p className="text-xs text-gray-400 mt-1">Пробајте со поинаков термин</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <p className="text-sm text-gray-500 mb-4">
                Пронајдени <span className="font-semibold text-gray-700">{results.length}</span> релевантни сегменти
              </p>
              {results.map((result, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-5 py-4 hover:border-gray-200 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-150"
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {result.source_filename}
                      </p>
                      {result.page_number && (
                        <p className="text-xs text-gray-400">Страна {result.page_number}</p>
                      )}
                    </div>
                    <div className={cn(
                      'px-2 py-1 rounded-lg text-xs font-semibold',
                      result.score >= 0.8 ? 'bg-green-50 text-green-700' :
                      result.score >= 0.6 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-gray-50 text-gray-600'
                    )}>
                      {(result.score * 100).toFixed(0)}%
                    </div>
                  </div>

                  {/* Content */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pl-11">
                    {highlightText(result.content, query)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
