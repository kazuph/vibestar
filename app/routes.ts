import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),

  // API routes
  route("/api/health", "routes/api.health.ts"),
  route("/api/auth/*", "routes/api.auth.$.ts"),
  route("/api/chat", "routes/api.chat.ts"),
  route("/api/documents", "routes/api.documents.ts"),
  route("/api/ai-test", "routes/api.ai-test.ts"),

  // Auth routes
  route("/auth/signup", "routes/auth.signup.tsx"),
  route("/auth/signin", "routes/auth.signin.tsx"),
  route("/auth/verify-otp", "routes/auth.verify-otp.tsx"),

  // Protected routes
  route("/dashboard", "routes/dashboard._index.tsx"),
] satisfies RouteConfig;
