import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import type { Route } from "./+types/auth.verify-otp";
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Enter verification code
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            We sent a code to{" "}
            <span className="font-medium text-gray-900">{email}</span>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {resendMessage && (
            <div className="rounded-md bg-green-50 p-4">
              <p className="text-sm text-green-700">{resendMessage}</p>
            </div>
          )}

          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-2xl tracking-widest shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none sm:text-3xl"
              placeholder="000000"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="flex w-full justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Verifying..." : "Verify and continue"}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending}
              className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResending ? "Sending..." : "Didn't receive a code? Resend"}
            </button>
          </div>

          <div className="text-center text-sm">
            <Link
              to={type === "signup" ? "/auth/signup" : "/auth/signin"}
              className="font-medium text-gray-600 hover:text-gray-500"
            >
              Use a different email
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
