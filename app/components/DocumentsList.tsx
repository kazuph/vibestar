import { useState, useEffect, useCallback } from "react";

interface Document {
  id: string;
  title: string;
  mimeType: string;
  status: "processing" | "ready" | "failed";
  createdAt: number | Date;
  updatedAt: number | Date;
}

interface DocumentsListProps {
  refreshTrigger?: number;
  initialDocuments?: Document[];
}

export function DocumentsList({ refreshTrigger, initialDocuments }: DocumentsListProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments || []);
  const [isLoading, setIsLoading] = useState(!initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/documents", {
        credentials: "include",
      });

      if (!response.ok) {
        // If fetch fails but we have initial data, just use that
        if (initialDocuments && initialDocuments.length > 0) {
          setDocuments(initialDocuments);
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
        setDocuments(initialDocuments);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [initialDocuments]);

  // Only fetch on mount if no initial data provided
  useEffect(() => {
    if (!initialDocuments) {
      loadDocuments();
    }
  }, [initialDocuments, loadDocuments]);

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
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Ready
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
            Processing...
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
            Failed
          </span>
        );
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500">
        Loading documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
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
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
        No documents uploaded yet. Upload a document to enable RAG.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Title
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-3">
                <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                <div className="text-xs text-gray-500">{doc.id.slice(0, 8)}...</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {doc.mimeType}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {getStatusBadge(doc.status)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(doc.createdAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
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
