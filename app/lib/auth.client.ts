import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth client for React components
 * Includes the Email OTP plugin for client-side operations
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  plugins: [emailOTPClient()],
});

/**
 * Export commonly used hooks and methods
 */
export const {
  signIn,
  signOut,
  useSession,
  getSession,
  emailOtp,
} = authClient;

/**
 * Type for the session
 */
export type Session = typeof authClient.$Infer.Session;
export type User = typeof authClient.$Infer.Session.user;
