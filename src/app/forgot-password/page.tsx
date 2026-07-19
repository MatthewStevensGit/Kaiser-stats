"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyAuthErrorMessage } from "@/lib/auth/error-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type Step = "email" | "reset";
type Status = "idle" | "sending" | "error";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Code-based reset, never a clickable link — same reasoning as the main
 * login flow (src/app/login/page.tsx's doc comment): a clickable link's
 * one-time token can get silently burned by antivirus/email link-prescanning
 * before the real user ever clicks it. The "Reset Password" Supabase email
 * template only ever shows {{ .Token }}, never the link, to match.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(error.message));
      return;
    }
    setStatus("idle");
    setStep("reset");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setStatus("error");
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMessage("Passwords don't match.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "recovery",
    });
    if (verifyError) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(verifyError.message));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setStatus("error");
      setErrorMessage(friendlyAuthErrorMessage(updateError.message));
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Reset Password</h1>
      </header>

      <div className="card">
        {step === "email" ? (
          <form onSubmit={handleRequestCode} className="login-form">
            <label htmlFor="forgot-email" className="login-form-label">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-form-input"
              disabled={status === "sending"}
            />
            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending..." : "Send reset code"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="login-form">
            <p className="note">
              Enter the code we emailed to {email} (check spam if it doesn&apos;t show up), and
              your new password.
            </p>
            <label htmlFor="reset-code" className="login-form-label">
              Code
            </label>
            <input
              id="reset-code"
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

            <label htmlFor="reset-new-password" className="login-form-label">
              New password
            </label>
            <input
              id="reset-new-password"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="login-form-input"
              disabled={status === "sending"}
            />

            <label htmlFor="reset-confirm-password" className="login-form-label">
              Confirm new password
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-form-input"
              disabled={status === "sending"}
            />

            <button type="submit" className="login-form-submit" disabled={status === "sending"}>
              {status === "sending" ? "Saving..." : "Set new password"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}

            <button
              type="button"
              className="note login-form-resend"
              onClick={() => {
                setStep("email");
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
