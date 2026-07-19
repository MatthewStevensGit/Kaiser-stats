"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { linkPlayerAfterLogin } from "@/lib/auth/actions";
import { friendlyAuthErrorMessage } from "@/lib/auth/error-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type Step = "email" | "code";
type Status = "idle" | "sending" | "error";

/** Blocks the resend button for this long after a code is sent — long enough that a real resend can't itself trip the provider's own rate limit. */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Email + typed code, not a clickable magic link — a clickable link's
 * one-time code can get silently burned by antivirus/email link-prescanning
 * before the real user ever clicks it (a real failure this app hit), and a
 * typed code has no link for anything else to consume first. Code length
 * isn't assumed anywhere — verifyOtp() just checks whatever was typed
 * against whatever Supabase generated.
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

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

    const linkResult = await linkPlayerAfterLogin();
    if (!linkResult.ok) {
      setStatus("error");
      setErrorMessage(linkResult.error);
      return;
    }

    router.push(linkResult.needsOnboarding ? "/onboarding" : "/");
    router.refresh();
  }

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Log In</h1>
      </header>

      <div className="card">
        {step === "email" ? (
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
          </form>
        ) : (
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
            <button
              type="button"
              className="note login-form-resend"
              onClick={() => {
                setStep("email");
                setCode("");
                setStatus("idle");
                setErrorMessage(null);
                setResendCooldown(0);
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
