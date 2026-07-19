"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyAuthErrorMessage } from "@/lib/auth/error-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type Step = "details" | "verify";
type Status = "idle" | "sending" | "error";

const MIN_PASSWORD_LENGTH = 8;

/**
 * The explicit "I'm new here" entry point — distinct from /login's "log in
 * with a code instead" fallback (which also happens to create an account
 * under the hood, but reads like a returning-user option, not an invitation
 * to sign up). Code-based email confirmation only, never a clickable link,
 * same reasoning as /login and /forgot-password: a one-time token in a link
 * can get silently burned by antivirus/email link-prescanning before the
 * real person ever clicks it. Supabase's "Confirm signup" email template
 * must show only {{ .Token }} to match (see the other two templates already
 * customized this way).
 */
export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus("error");
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setErrorMessage("Passwords don't match.");
      return;
    }

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setStatus("error");
        setErrorMessage(friendlyAuthErrorMessage(error.message));
        return;
      }
      setStatus("idle");
      setStep("verify");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong — please try again.");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });

      if (error) {
        setStatus("error");
        setErrorMessage(friendlyAuthErrorMessage(error.message));
        return;
      }

      // Password's already set (signUp above required it) — flag this so
      // onboarding doesn't ask again. No router.refresh(): this app's
      // established pattern is server-side revalidatePath inside the next
      // Server Action (completeOnboarding), not a client-side refresh
      // alongside push, which is racy (see login/page.tsx's doc comment).
      router.push("/onboarding?newSignup=1");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong — please try again.");
    }
  }

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Sign Up</h1>
      </header>

      <div className="card">
        {step === "details" ? (
          <form onSubmit={handleCreateAccount} className="login-form">
            <label htmlFor="signup-email" className="login-form-label">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-form-input"
              disabled={status === "sending"}
            />

            <label htmlFor="signup-password" className="login-form-label">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-form-input"
              disabled={status === "sending"}
            />

            <label htmlFor="signup-confirm-password" className="login-form-label">
              Confirm password
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-form-input"
              disabled={status === "sending"}
            />

            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Creating account..." : "Sign Up"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}

            <Link href="/login" className="note login-form-resend">
              Already have an account? Log in
            </Link>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="login-form">
            <p className="note">
              Enter the code we emailed to {email} (check spam if it doesn&apos;t show up).
            </p>
            <label htmlFor="signup-code" className="login-form-label">
              Code
            </label>
            <input
              id="signup-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code from your email"
              className="login-form-input"
              disabled={status === "sending"}
            />
            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Verifying..." : "Verify and continue"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}

            <button
              type="button"
              className="note login-form-resend"
              onClick={() => {
                setStep("details");
                setCode("");
                setStatus("idle");
                setErrorMessage(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
