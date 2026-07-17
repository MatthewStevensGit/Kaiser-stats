"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateDisplayName } from "@/lib/auth/actions";

export function SettingsForm({ displayName, email }: { displayName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    startTransition(async () => {
      const result = await updateDisplayName(name);
      if (!result.ok) {
        setStatus("error");
        setError(result.error);
        return;
      }
      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <label htmlFor="settings-email" className="login-form-label">
        Email
      </label>
      <input id="settings-email" type="email" value={email} className="login-form-input" disabled readOnly />

      <label htmlFor="settings-name" className="login-form-label">
        Display name
      </label>
      <input
        id="settings-name"
        type="text"
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setStatus("idle");
        }}
        className="login-form-input"
        disabled={isPending}
      />

      {status === "error" && error && <p className="note login-form-error">{error}</p>}
      {status === "saved" && <p className="note">Saved.</p>}

      <button type="submit" className="login-form-submit" disabled={isPending || !name.trim()}>
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
