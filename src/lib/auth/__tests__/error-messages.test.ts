import { describe, expect, it } from "vitest";
import { friendlyAuthErrorMessage } from "../error-messages";

describe("friendlyAuthErrorMessage", () => {
  it("recognizes a rate-limit error", () => {
    expect(friendlyAuthErrorMessage("Email rate limit exceeded")).toBe(
      "Too many codes requested for this email — wait a few minutes and try again.",
    );
  });

  it("recognizes an expired/invalid token error", () => {
    expect(friendlyAuthErrorMessage("Token has expired or is invalid")).toBe(
      "That code is wrong or has expired — double check it, or request a new one.",
    );
  });

  it("recognizes a network error", () => {
    expect(friendlyAuthErrorMessage("Failed to fetch")).toBe(
      "Couldn't reach the server — check your connection and try again.",
    );
  });

  it("is case-insensitive", () => {
    expect(friendlyAuthErrorMessage("RATE LIMIT EXCEEDED")).toContain("Too many codes requested");
  });

  it("falls through to the raw message for anything unrecognized", () => {
    expect(friendlyAuthErrorMessage("Some brand new Supabase error we've never seen")).toBe(
      "Some brand new Supabase error we've never seen",
    );
  });
});
