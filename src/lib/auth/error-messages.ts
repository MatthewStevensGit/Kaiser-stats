/**
 * Supabase Auth's own error messages are accurate but not written for a
 * non-technical member trying to check in before a game — this translates
 * the handful of cases that actually happen in practice into plain English.
 * Anything unrecognized falls through to the raw message rather than being
 * hidden, so a genuinely new failure mode is never silently swallowed.
 */
export function friendlyAuthErrorMessage(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  // Checked before the generic "invalid"/"expired" branch below — Supabase's
  // wrong-password error is literally "Invalid login credentials", which
  // would otherwise get misclassified as a bad OTP code and show
  // nonsensical "double check the code" messaging for a password login.
  if (lower.includes("credentials")) {
    return "Wrong email or password — double check them, or use \"Forgot password?\" below.";
  }
  if (lower.includes("rate limit")) {
    return "Too many codes requested for this email — wait a few minutes and try again.";
  }
  if (lower.includes("expired") || lower.includes("invalid") || lower.includes("token")) {
    return "That code is wrong or has expired — double check it, or request a new one.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Couldn't reach the server — check your connection and try again.";
  }

  return rawMessage;
}
