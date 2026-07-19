"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { linkPlayerAfterLogin } from "@/lib/auth/actions";
import { friendlyAuthErrorMessage } from "@/lib/auth/error-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type Step = "password" | "email" | "code";
type Status = "idle" | "sending" | "error";

/** Blocks the resend button for this long after a code is sent — long enough that a real resend can't itself trip the provider's own rate limit. */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Password is the primary way in day-to-day (no email round trip needed);
 * the emailed code stays available as a fallback for both a genuinely
 * forgotten password and anyone who hasn't set one yet (see completeOnboarding
 * in src/lib/auth/actions.ts, where a new account sets its password once,
 * right after this same code flow verifies their email).
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  async function afterVerifiedSession() {
    const linkResult = await linkPlayerAfterLogin();
    if (!linkResult.ok) {
      setStatus("error");
      setErrorMessage(linkResult.error);
      return;
    }

    router.push(linkResult.needsOnboarding ? "/onboarding" : "/");
    router.refresh();
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(error.message));
      return;
    }

    await afterVerifiedSession();
  }

  async function requestCode() {
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(error.message));
      return false;
    }
    setStatus("idle");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (await requestCode()) setStep("code");
  }

  async function handleResendCode() {
    await requestCode();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (verifyError) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(verifyError.message));
      return;
    }

    await afterVerifiedSession();
  }

  function resetToStep(next: Step) {
    setStep(next);
    setCode("");
    setStatus("idle");
    setErrorMessage(null);
    setResendCooldown(0);
  }

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Log In</h1>
      </header>

      <div className="card">
        {step === "password" && (
          <form onSubmit={handlePasswordLogin} className="login-form">
            <label htmlFor="password-email" className="login-form-label">
              Email
            </label>
            <input
              id="password-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-form-input"
              disabled={status === "sending"}
            />

            <label htmlFor="password-password" className="login-form-label">
              Password
            </label>
            <input
              id="password-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-form-input"
              disabled={status === "sending"}
            />

            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Logging in..." : "Log In"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}

            <button type="button" className="note login-form-resend" onClick={() => resetToStep("email")}>
              Log in with a code instead
            </button>
            <Link href="/forgot-password" className="note login-form-resend">
              Forgot password?
            </Link>
          </form>
        )}

        {step === "email" && (
          <form onSubmit={handleSendCode} className="login-form">
            <label htmlFor="email" className="login-form-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-form-input"
              disabled={status === "sending"}
            />
            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending..." : "Send code"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}

            <button type="button" className="note login-form-resend" onClick={() => resetToStep("password")}>
              Use password instead
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="login-form">
            <p className="note">
              Enter the code we emailed to {email} (check spam if it doesn&apos;t show up).
            </p>
            <label htmlFor="code" className="login-form-label">
              Code
            </label>
            <input
              id="code"
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
              {status === "sending" ? "Verifying..." : "Verify code"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}
            <button
              type="button"
              className="note login-form-resend"
              onClick={handleResendCode}
              disabled={status === "sending" || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
            </button>
            <button type="button" className="note login-form-resend" onClick={() => resetToStep("email")}>
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
