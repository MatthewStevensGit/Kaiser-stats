"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main>
      <header className="screen-header-row">
        <h1 className="screen-header">Log In</h1>
      </header>

      <div className="card">
        {status === "sent" ? (
          <p className="note">Check your email for a login link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
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
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
            {status === "error" && errorMessage && <p className="note login-form-error">{errorMessage}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
