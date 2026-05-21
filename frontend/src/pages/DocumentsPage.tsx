import { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, FileText, Loader2, AlertCircle } from 'lucide-react';
import { getDocuments, uploadDocument, deleteDocument, type Document } from '@/api/client';
import { cn } from '@/lib/utils';

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          setError(`${file.name} не е PDF документ`);
          continue;
        }
        await uploadDocument(file);
      }
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка при прикачување');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-900">Документи</h2>
        <p className="text-sm text-gray-500">Прикачете правни документи за анализа</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Upload zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6',
            dragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary-600 mb-3" />
              <p className="text-sm text-gray-600">Се прикачува...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="h-10 w-10 text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Повлечете PDF документ тука
              </p>
              <p className="text-xs text-gray-500 mt-1">или</p>
              <label className="mt-3 cursor-pointer rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                Изберете датотека
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
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Нема прикачени документи</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">
              Прикачени документи ({documents.length})
            </h3>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.filename}</p>
                    <p className="text-xs text-gray-500">
                      {doc.chunk_count} делови • {doc.page_count} страници •{' '}
                      {new Date(doc.uploaded_at).toLocaleDateString('mk-MK')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
  );
}
