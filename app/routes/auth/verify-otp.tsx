import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import type { Route } from "./+types/verify-otp";
import { signIn, emailOtp } from "~/lib/auth.client";

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Verify Code - Vibestar" },
    { name: "description", content: "Enter your verification code" },
  ];
};

export default function VerifyOTP() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "signin";

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    // Get email from sessionStorage
    const storedEmail = sessionStorage.getItem("auth_email");
    if (storedEmail) {
      setEmail(storedEmail);
    } else {
      // Redirect to signup/signin if no email is stored
      navigate(type === "signup" ? "/auth/signup" : "/auth/signin");
    }
  }, [navigate, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Use signIn.emailOtp for sign-in OTP verification (creates session)
      // NOT emailOtp.verifyEmail which is for email verification only
      const result = await signIn.emailOtp({
        email,
        otp,
      });

      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        return;
      }

      // Clear stored email
      sessionStorage.removeItem("auth_email");

      // Redirect to dashboard
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsResending(true);
    setError(null);
    setResendMessage(null);

    try {
      const result = await emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });

      if (result.error) {
        setError(result.error.message || "Failed to resend code");
        return;
      }

      setResendMessage("A new verification code has been sent to your email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="border-b border-warm-200">
        <div className="mx-auto max-w-6xl px-6 py-4">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-warm-900">
              Enter verification code
            </h1>
            <p className="mt-2 text-sm text-warm-600">
              We sent a code to{" "}
              <span className="font-medium text-warm-900">{email}</span>
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-4"
              >
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {resendMessage && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm text-green-700">{resendMessage}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="otp"
                className="block text-sm font-medium text-warm-700"
              >
                Verification code
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="mt-2 block w-full rounded-lg border border-warm-300 bg-white px-4 py-4 text-center text-2xl tracking-widest text-warm-900 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 sm:text-3xl"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Verifying...
                </>
              ) : (
                "Verify and continue"
              )}
            </button>

            <div className="space-y-3 text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isResending}
                className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResending ? "Sending..." : "Didn't receive a code? Resend"}
              </button>

              <p className="text-sm text-warm-600">
                <Link
                  to={type === "signup" ? "/auth/signup" : "/auth/signin"}
                  className="font-medium text-warm-700 transition-colors hover:text-warm-900"
                >
                  Use a different email
                </Link>
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
