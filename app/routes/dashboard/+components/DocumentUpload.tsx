import { useState, useRef, useCallback } from "react";

interface DocumentUploadProps {
  projectId?: string | null;
  onUploadComplete?: (documentId: string) => void;
}

export function DocumentUpload({ projectId, onUploadComplete }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  async function uploadFile(file: File) {
    // Validate file type
    const allowedTypes = ["text/plain", "text/markdown", "application/json", "text/csv"];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|md|json|csv)$/i)) {
      setError("Only text files are supported (.txt, .md, .json, .csv)");
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setError("File size must be less than 1MB");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);
      if (projectId) {
        formData.append("projectId", projectId);
      }

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      let data: { id?: string; error?: string };
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server error (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setSuccess(`Document "${file.name}" uploaded successfully. Processing...`);

      if (onUploadComplete && data.id) {
        onUploadComplete(data.id);
      }

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-accent-500 bg-accent-50"
            : "border-warm-300 hover:border-warm-400"
        } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <svg
            className="h-10 w-10 text-warm-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {isUploading ? (
            <p className="text-warm-600">Uploading...</p>
          ) : (
            <>
              <p className="text-warm-600">
                <span className="font-medium text-accent-600">Click to upload</span> or
                drag and drop
              </p>
              <p className="text-sm text-warm-400">
                TXT, MD, JSON, CSV (max 1MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}
    </div>
  );
}
