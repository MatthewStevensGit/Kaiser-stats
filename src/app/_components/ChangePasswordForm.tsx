"use client";

import { useState, useTransition } from "react";
import { setOwnPassword } from "@/lib/auth/actions";
import { useToast } from "./ToastProvider";

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordForm({ email }: { email: string }) {
  const { showToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      showToast("error", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "Passwords don't match.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await setOwnPassword(newPassword);
        if (!result.ok) return showToast("error", result.error);
        showToast("success", "Password updated.");
        setNewPassword("");
        setConfirmPassword("");
      } catch {
        showToast("error", "Something went wrong — please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {/* Hidden username field so the browser's password manager updates the
          right saved credential instead of treating this as unrelated. */}
      <input type="email" name="email" value={email} readOnly autoComplete="username" hidden />

      <label htmlFor="change-password-new" className="login-form-label">
        New password
      </label>
      <input
        id="change-password-new"
        type="password"
        required
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <label htmlFor="change-password-confirm" className="login-form-label">
        Confirm new password
      </label>
      <input
        id="change-password-confirm"
        type="password"
        required
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="login-form-input"
        disabled={isPending}
      />

      <button
        type="submit"
        className="login-form-submit"
        disabled={isPending || !newPassword || !confirmPassword}
      >
        {isPending ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
