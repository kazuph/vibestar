import { useState, useEffect } from "react";
import { Chat } from "./Chat";
import { DocumentUpload } from "./DocumentUpload";
import { DocumentsList } from "./DocumentsList";

interface Project {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsListProps {
  onProjectSelect?: (projectId: string | null, projectName: string | null) => void;
  selectedProjectId?: string | null;
}

export function ProjectsList({
  onProjectSelect,
  selectedProjectId: externalSelectedProjectId,
}: ProjectsListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Internal state for project detail view
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/projects");
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = (await response.json()) as { projects?: Project[] };
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      setNewProjectName("");
      setNewProjectDescription("");
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project? Documents will be moved to 'Uncategorized'.")) {
      return;
    }

    try {
      const response = await fetch(`/api/projects?id=${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to delete project");
      }

      // If deleted project was being viewed, go back to list
      if (viewingProjectId === projectId) {
        setViewingProjectId(null);
      }

      // Also notify parent if needed
      if (externalSelectedProjectId === projectId) {
        onProjectSelect?.(null, null);
      }

      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  const handleViewProject = (project: Project) => {
    setViewingProjectId(project.id);
    // Also notify parent for external state sync
    onProjectSelect?.(project.id, project.name);
  };

  const handleBackToList = () => {
    setViewingProjectId(null);
    onProjectSelect?.(null, null);
  };

  const handleDocumentUploaded = () => {
    setDocumentRefreshTrigger((prev) => prev + 1);
  };

  // Get the currently viewed project
  const viewingProject = projects.find((p) => p.id === viewingProjectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
      </div>
    );
  }

  // Project Detail View
  if (viewingProjectId && viewingProject) {
    return (
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-2 text-warm-600 hover:text-warm-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Projects
          </button>
        </div>

        {/* Project Info */}
        <div className="rounded-lg border border-warm-200 bg-warm-50 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-warm-900">{viewingProject.name}</h2>
                {viewingProject.isDefault && (
                  <span className="px-2 py-0.5 text-xs bg-warm-200 text-warm-600 rounded">
                    Default
                  </span>
                )}
              </div>
              {viewingProject.description && (
                <p className="mt-2 text-warm-600">{viewingProject.description}</p>
              )}
            </div>
            {!viewingProject.isDefault && (
              <button
                onClick={() => handleDeleteProject(viewingProject.id)}
                className="p-2 text-warm-400 hover:text-red-500 transition-colors"
                title="Delete project"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Document Upload Section */}
        <div className="rounded-lg border border-warm-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">Upload Documents</h3>
          <p className="text-sm text-warm-600 mb-4">
            Upload documents to this project. They will be used for RAG when chatting.
          </p>
          <DocumentUpload
            projectId={viewingProjectId}
            onUploadComplete={handleDocumentUploaded}
          />
        </div>

        {/* Documents List Section */}
        <div className="rounded-lg border border-warm-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-4">Project Documents</h3>
          <DocumentsList
            projectId={viewingProjectId}
            refreshTrigger={documentRefreshTrigger}
          />
        </div>

        {/* RAG-enabled Chat Section */}
        <div className="rounded-lg border border-warm-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-2">AI Chat with RAG</h3>
          <p className="text-sm text-warm-600 mb-4">
            Chat with AI using documents from this project as context.
          </p>
          <Chat projectId={viewingProjectId} projectName={viewingProject.name} />
        </div>
      </div>
    );
  }

  // Projects List View
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">Projects</h3>
        <p className="text-sm text-warm-600 mb-4">
          Click on a project to view details, manage documents, and chat with RAG context.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            x
          </button>
        </div>
      )}

      {/* Create new project form */}
      <form onSubmit={handleCreateProject} className="bg-warm-50 rounded-lg p-4">
        <h4 className="font-medium text-warm-900 mb-3">Create New Project</h4>
        <div className="space-y-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name"
            className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            disabled={isCreating}
          />
          <input
            type="text"
            value={newProjectDescription}
            onChange={(e) => setNewProjectDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            disabled={isCreating}
          />
          <button
            type="submit"
            disabled={!newProjectName.trim() || isCreating}
            className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>

      {/* Projects list */}
      <div className="space-y-3">
        <h4 className="font-medium text-warm-900">Your Projects</h4>
        {projects.length === 0 ? (
          <p className="text-warm-500 text-sm">
            No projects yet. Create your first project above.
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-4 border border-warm-200 rounded-lg cursor-pointer transition-colors hover:bg-warm-50 hover:border-accent-300"
                onClick={() => handleViewProject(project)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-warm-900">
                      {project.name}
                    </span>
                    {project.isDefault && (
                      <span className="px-2 py-0.5 text-xs bg-warm-200 text-warm-600 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-sm text-warm-500 mt-1">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-warm-400">View details</span>
                  <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
