import { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, FileText, Loader2, AlertCircle, CheckCircle2, Database, BookOpen } from 'lucide-react';
import { getDocuments, uploadDocument, deleteDocument, type Document } from '@/api/client';
import { cn } from '@/lib/utils';

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка при вчитување');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
  const totalPages = documents.reduce((sum, d) => sum + (d.page_count || 0), 0);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let uploaded = 0;
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          setError(`${file.name} не е PDF документ`);
          continue;
        }
        await uploadDocument(file);
        uploaded++;
      }
      await loadDocuments();
      if (uploaded > 0) {
        setSuccess(`Успешно прикачен${uploaded > 1 ? 'и' : ''} ${uploaded} документ${uploaded > 1 ? 'и' : ''}`);
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка при прикачување');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: number, filename: string) => {
    if (!confirm(`Дали сте сигурни дека сакате да го избришете "${filename}"?`)) return;
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSuccess('Документот е избришан');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка при бришење');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header with stats */}
      <header className="px-6 py-5 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900">Правна база</h2>
          <p className="text-sm text-gray-500 mt-0.5">Управување со правни документи и закони</p>

          {/* Stats row */}
          {!isLoading && documents.length > 0 && (
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{documents.length}</p>
                  <p className="text-xs text-gray-500">Документи</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
                  <Database className="h-4 w-4 text-accent-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{totalChunks.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Сегменти</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{totalPages.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Страници</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-4xl mx-auto">
          {/* Notifications */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 animate-fade-in">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Upload zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 mb-6',
              dragActive
                ? 'border-primary-400 bg-primary-50/50 scale-[1.01]'
                : 'border-gray-200 bg-white hover:border-gray-300'
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary-600 mb-3" />
                <p className="text-sm font-medium text-gray-700">Се обработува...</p>
                <p className="text-xs text-gray-500 mt-1">Извлекување текст и создавање сегменти</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
                  <Upload className="h-6 w-6 text-primary-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  Повлечете PDF документ тука
                </p>
                <p className="text-xs text-gray-500 mt-1">или кликнете за избор</p>
                <label className="mt-4 cursor-pointer inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-all duration-150 shadow-sm hover:shadow-md active:scale-95">
                  <Upload className="h-4 w-4" />
                  Прикачи документ
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Documents list */}
          {isLoading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-500">Се вчитуваат документи...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">Нема прикачени документи</p>
              <p className="text-xs text-gray-400 mt-1">Прикачете PDF за да започнете</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Сите документи
                </h3>
              </div>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:border-gray-200 hover:shadow-sm transition-all duration-150 animate-fade-in"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">{doc.page_count} стр.</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-500">{doc.chunk_count} сегменти</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-500">
                        {new Date(doc.uploaded_at).toLocaleDateString('mk-MK')}
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium',
                    doc.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                  )}>
                    {doc.status === 'completed' ? 'Активен' : doc.status}
                  </span>
                  <button
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150"
                    title="Избриши"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
