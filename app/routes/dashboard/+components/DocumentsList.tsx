import { useState, useEffect, useCallback } from "react";

interface Document {
  id: string;
  projectId?: string | null;
  title: string;
  mimeType: string;
  status: "processing" | "ready" | "failed";
  createdAt: number | Date;
  updatedAt: number | Date;
}

interface DocumentsListProps {
  projectId?: string | null;
  refreshTrigger?: number;
  initialDocuments?: Document[];
}

export function DocumentsList({ projectId, refreshTrigger, initialDocuments }: DocumentsListProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments || []);
  const [isLoading, setIsLoading] = useState(!initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = projectId
        ? `/api/documents?projectId=${projectId}`
        : "/api/documents";
      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        // If fetch fails but we have initial data, just use that
        if (initialDocuments && initialDocuments.length > 0) {
          // Filter initial documents by projectId if specified
          const filtered = projectId
            ? initialDocuments.filter((d) => d.projectId === projectId)
            : initialDocuments;
          setDocuments(filtered);
          setError(null);
          return;
        }
        throw new Error("Failed to load documents");
      }

      const data = (await response.json()) as { documents: Document[] };
      setDocuments(data.documents);
      setError(null);
    } catch (err) {
      // If we have initial documents, use them silently
      if (initialDocuments) {
        // Filter initial documents by projectId if specified
        const filtered = projectId
          ? initialDocuments.filter((d) => d.projectId === projectId)
          : initialDocuments;
        setDocuments(filtered);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [initialDocuments, projectId]);

  // Fetch on mount or when projectId changes
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Reload when refreshTrigger changes (after upload)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadDocuments();
    }
  }, [refreshTrigger, loadDocuments]);

  // Refresh processing documents periodically
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(loadDocuments, 5000);
    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

  async function handleDelete(documentId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;

    setDeletingId(documentId);

    try {
      const response = await fetch(`/api/documents?_method=DELETE&id=${documentId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(timestamp: number | Date) {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusBadge(status: Document["status"]) {
    switch (status) {
      case "ready":
        return (
          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Ready
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
            Processing...
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            Failed
          </span>
        );
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-warm-500">
        Loading documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
        <button
          onClick={loadDocuments}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-warm-300 p-8 text-center text-warm-500">
        No documents uploaded yet. Upload a document to enable RAG.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-warm-200">
      <table className="min-w-full divide-y divide-warm-200">
        <thead className="bg-warm-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-warm-500">
              Title
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-warm-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-warm-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-warm-500">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-warm-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200 bg-white">
          {documents.map((doc) => (
            <tr key={doc.id} className="transition-colors hover:bg-warm-50">
              <td className="whitespace-nowrap px-4 py-3">
                <div className="text-sm font-medium text-warm-900">{doc.title}</div>
                <div className="text-xs text-warm-500">{doc.id.slice(0, 8)}...</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-warm-500">
                {doc.mimeType}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {getStatusBadge(doc.status)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-warm-500">
                {formatDate(doc.createdAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="text-sm text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
                >
                  {deletingId === doc.id ? "Deleting..." : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
