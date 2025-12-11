import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { createDb, type DbEnv } from "./db/client";
import * as schema from "./db/schema";

/**
 * Environment type for Better Auth
 */
export interface AuthEnv extends DbEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
}

/**
 * Email sending function
 * Uses Resend in production, SMTP (Mailpit) in development
 */
async function sendEmail(env: AuthEnv, to: string, subject: string, html: string): Promise<void> {
  // Production: Use Resend API
  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vibestar <noreply@vibestar.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Resend email error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log(`Email sent to ${to} via Resend`);
    return;
  }

  // Development: Use SMTP (Mailpit)
  const smtpHost = env.SMTP_HOST || "localhost";
  const smtpPort = env.SMTP_PORT || "11025";

  // For Cloudflare Workers, we use a simple SMTP implementation
  // In development, Mailpit accepts emails without authentication
  const emailData = {
    from: "Vibestar <noreply@vibestar.dev>",
    to,
    subject,
    html,
  };

  try {
    // Use Mailpit's SMTP API endpoint for sending emails
    // Mailpit exposes an HTTP API at port 8025
    const mailpitApiUrl = `http://${smtpHost}:18025/api/v1/send`;

    const response = await fetch(mailpitApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: { Email: "noreply@vibestar.dev", Name: "Vibestar" },
        To: [{ Email: to }],
        Subject: subject,
        HTML: html,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mailpit error: ${await response.text()}`);
    }

    console.log(`Email sent to ${to} via Mailpit`);
  } catch (error) {
    // Fallback: Log the email content for debugging
    console.log("=== EMAIL DEBUG (Mailpit not available) ===");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML: ${html}`);
    console.log("============================================");
  }
}

/**
 * Creates a Better Auth instance with the provided environment
 * This function should be called for each request with the appropriate env
 */
export function createAuth(env: AuthEnv, request: Request) {
  const db = createDb(env);

  // Determine the base URL
  const url = new URL(request.url);
  const baseURL = env.BETTER_AUTH_URL || `${url.protocol}//${url.host}`;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: false, // We use Email OTP only
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every day
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          const subject =
            type === "sign-in"
              ? "Your Vibestar sign-in code"
              : type === "email-verification"
                ? "Verify your Vibestar email"
                : "Your Vibestar verification code";

          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>${subject}</title>
            </head>
            <body style="font-family: sans-serif; padding: 20px;">
              <h1 style="color: #333;">Your verification code</h1>
              <p>Use this code to ${type === "sign-in" ? "sign in to" : "verify your email with"} Vibestar:</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f5f5f5; text-align: center; margin: 20px 0;">
                ${otp}
              </div>
              <p>This code expires in 10 minutes.</p>
              <p>If you didn't request this code, you can safely ignore this email.</p>
            </body>
            </html>
          `;

          await sendEmail(env, email, subject, html);
        },
        otpLength: 6,
        expiresIn: 600, // 10 minutes
        sendVerificationOnSignUp: true,
        disableSignUp: false,
      }),
    ],
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
    },
  });
}

/**
 * Type for the auth instance
 */
export type Auth = ReturnType<typeof createAuth>;
