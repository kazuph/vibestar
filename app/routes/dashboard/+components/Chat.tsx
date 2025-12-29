import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  conversationId?: string;
  projectId?: string | null;  // When specified, RAG is automatically enabled
  projectName?: string | null;  // Name of the selected project
}

export function Chat({ conversationId: initialConversationId, projectId, projectName }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load existing messages if conversationId is provided
  useEffect(() => {
    if (initialConversationId) {
      loadMessages(initialConversationId);
    }
  }, [initialConversationId]);

  // Clear messages when projectId changes
  useEffect(() => {
    setMessages([]);
    setConversationId(undefined);
  }, [projectId]);

  async function loadMessages(convId: string) {
    try {
      const response = await fetch(`/api/chat?conversationId=${convId}`);
      if (response.ok) {
        const data = (await response.json()) as { messages: { id: string; role: string; content: string }[] };
        setMessages(
          data.messages.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const requestBody: {
        message: string;
        conversationId?: string;
        projectId?: string;
      } = {
        message: userMessage.content,
        conversationId,
      };

      // Add projectId if specified (automatically enables RAG)
      if (projectId) {
        requestBody.projectId = projectId;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      // Get conversation ID from response header
      const newConversationId = response.headers.get("X-Conversation-Id");
      if (newConversationId && !conversationId) {
        setConversationId(newConversationId);
      }

      // Stream response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let assistantContent = "";

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Read raw text stream (not SSE format)
      // Workers AI gpt-oss-120b returns plain text via simulated streaming
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: assistantContent }
              : msg
          )
        );
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("Request cancelled");
      } else {
        console.error("Chat error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Sorry, an error occurred. Please try again.",
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancel() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(undefined);
  }

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-warm-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-warm-200 px-4 py-3">
        <h3 className="font-medium text-warm-900">AI Chat</h3>
        <div className="flex items-center gap-3">
          {projectId ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
                {projectName || "Project"}
              </span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                RAG Enabled
              </span>
            </div>
          ) : (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              No Project
            </span>
          )}
          <button
            onClick={handleNewChat}
            className="rounded-lg border border-warm-300 bg-white px-3 py-1 text-sm text-warm-700 transition-colors hover:bg-warm-50"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-warm-400">
            {projectId ? "Start a conversation with RAG context" : "Start a conversation"}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                data-role={message.role}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-accent-600 text-white"
                      : "border border-warm-200 bg-warm-50 text-warm-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content || (isLoading && message.role === "assistant" ? "" : message.content)}</p>
                  {/* Show loading animation for empty assistant message while loading */}
                  {isLoading && message.role === "assistant" && !message.content && (
                    <div className="flex items-center gap-1">
                      <span className="text-warm-500">Thinking</span>
                      <span className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-warm-400" style={{ animationDelay: "0ms" }}></span>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-warm-400" style={{ animationDelay: "150ms" }}></span>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-warm-400" style={{ animationDelay: "300ms" }}></span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-warm-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-warm-300 px-4 py-2 text-warm-900 placeholder-warm-400 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-warm-100"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-accent-600 px-4 py-2 font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
