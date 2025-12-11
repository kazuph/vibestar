import { useState } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard._index";
import { createAuth, type AuthEnv } from "~/lib/auth.server";
import { createDb } from "~/lib/db/client";
import { document } from "~/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { useSession, signOut } from "~/lib/auth.client";
import { useNavigate } from "react-router";
import { Chat } from "~/components/Chat";
import { DocumentUpload } from "~/components/DocumentUpload";
import { DocumentsList } from "~/components/DocumentsList";
import type { Env } from "../../server/load-context";

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
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
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">
              Welcome to Vibestar!
            </h2>
            <p className="mt-2 text-gray-600">
              You are signed in as <strong>{user.email}</strong>
            </p>

            <div className="mt-6 border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-gray-500">Account details</h3>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">User ID</dt>
                  <dd className="mt-1 font-mono text-sm text-gray-900">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email verified</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {user.emailVerified ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                        Not verified
                      </span>
                    )}
                  </dd>
                </div>
                {user.name && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{user.name}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">AI Chat</h2>
              <p className="mb-6 text-sm text-gray-600">
                Chat with AI. Enable RAG to use your uploaded documents as context.
              </p>
              <Chat useRag={false} />
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Document Management
              </h2>
              <p className="mb-6 text-sm text-gray-600">
                Upload documents to use with RAG. Supported formats: TXT, MD, JSON, CSV.
              </p>
              <DocumentUpload onUploadComplete={handleDocumentUploaded} />
            </div>

            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
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
