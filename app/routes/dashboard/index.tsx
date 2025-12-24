import { useState } from "react";
import { redirect, Link } from "react-router";
import type { Route } from "./+types/index";
import { createAuth, type AuthEnv } from "~/lib/auth.server";
import { createDb } from "~/lib/db/client";
import { document } from "~/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { useSession, signOut } from "~/lib/auth.client";
import { useNavigate } from "react-router";
import { Chat } from "./+components/Chat";
import { DocumentUpload } from "./+components/DocumentUpload";
import { DocumentsList } from "./+components/DocumentsList";
import type { Env } from "../../../server/load-context";

type TabId = "account" | "chat" | "documents";

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Dashboard - Vibestar" },
    { name: "description", content: "Your Vibestar dashboard" },
  ];
};

/**
 * Document type for loader data
 */
interface DocumentData {
  id: string;
  title: string;
  mimeType: string;
  status: "processing" | "ready" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Server-side loader to check authentication and fetch documents
 * Redirects to signin if not authenticated
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const auth = createAuth(env, request);

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw redirect("/auth/signin");
  }

  // Fetch user's documents server-side to avoid client-side auth issues
  // Wrap in try-catch to prevent document fetch failures from breaking the dashboard
  let documents: DocumentData[] = [];
  try {
    const db = createDb(env);
    const result = await db
      .select({
        id: document.id,
        title: document.title,
        mimeType: document.mimeType,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      })
      .from(document)
      .where(eq(document.userId, session.user.id))
      .orderBy(desc(document.createdAt));
    documents = result as DocumentData[];
  } catch (error) {
    // Log error but don't fail the page - documents are optional
    console.error("Failed to fetch documents:", error);
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    },
    documents,
  };
}

const tabs: { id: TabId; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "chat", label: "AI Chat" },
  { id: "documents", label: "Documents" },
];

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [documentRefreshTrigger, setDocumentRefreshTrigger] = useState(0);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth/signin");
  };

  const handleDocumentUploaded = () => {
    setDocumentRefreshTrigger((prev) => prev + 1);
  };

  // Use loader data for initial render, session hook for updates
  const user = session?.user || loaderData.user;

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <header className="border-b border-warm-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                  />
                </svg>
              </div>
              <span className="text-xl font-semibold tracking-tight text-warm-900">
                Vibestar
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-warm-600">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-warm-300 bg-white px-4 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-warm-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-warm-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-accent-600 text-accent-600"
                    : "border-transparent text-warm-500 hover:border-warm-300 hover:text-warm-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Account Tab */}
        {activeTab === "account" && (
          <div className="rounded-lg border border-warm-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-warm-900">
              Welcome to Vibestar!
            </h2>
            <p className="mt-2 text-warm-600">
              You are signed in as <strong>{user.email}</strong>
            </p>

            <div className="mt-6 border-t border-warm-200 pt-6">
              <h3 className="text-sm font-medium text-warm-500">Account details</h3>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-sm font-medium text-warm-500">User ID</dt>
                  <dd className="mt-1 font-mono text-sm text-warm-900">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-warm-500">Email</dt>
                  <dd className="mt-1 text-sm text-warm-900">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-warm-500">Email verified</dt>
                  <dd className="mt-1 text-sm text-warm-900">
                    {user.emailVerified ? (
                      <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                        Not verified
                      </span>
                    )}
                  </dd>
                </div>
                {user.name && (
                  <div>
                    <dt className="text-sm font-medium text-warm-500">Name</dt>
                    <dd className="mt-1 text-sm text-warm-900">{user.name}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-warm-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-warm-900">AI Chat</h2>
              <p className="mb-6 text-sm text-warm-600">
                Chat with AI. Enable RAG to use your uploaded documents as context.
              </p>
              <Chat useRag={false} />
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-warm-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-warm-900">
                Document Management
              </h2>
              <p className="mb-6 text-sm text-warm-600">
                Upload documents to use with RAG. Supported formats: TXT, MD, JSON, CSV.
              </p>
              <DocumentUpload onUploadComplete={handleDocumentUploaded} />
            </div>

            <div className="rounded-lg border border-warm-200 bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold text-warm-900">
                Uploaded Documents
              </h2>
              <DocumentsList
                  refreshTrigger={documentRefreshTrigger}
                  initialDocuments={loaderData.documents}
                />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
