import { describe, expect, it } from "vitest";
import { createProvisionalIdentityFromEmail, findPlayerByEmail } from "../identity";
import type { PlayerIdentity } from "../types";

describe("createProvisionalIdentityFromEmail", () => {
  it("derives a deterministic slug canonicalId from the email", () => {
    const identity = createProvisionalIdentityFromEmail("Ari.Fox@Example.com");
    expect(identity.canonicalId).toBe("auto-ari-fox-example-com");
    expect(identity.status).toBe("provisional");
  });

  it("normalizes the email to lowercase for displayName and knownEmails", () => {
    const identity = createProvisionalIdentityFromEmail("Ari.Fox@Example.com");
    expect(identity.displayName).toBe("ari.fox@example.com");
    expect(identity.knownEmails).toEqual(["ari.fox@example.com"]);
  });

  it("produces the same canonicalId for the same email every time", () => {
    const a = createProvisionalIdentityFromEmail("new.player@example.com");
    const b = createProvisionalIdentityFromEmail("new.player@example.com");
    expect(a.canonicalId).toBe(b.canonicalId);
  });
});

describe("findPlayerByEmail", () => {
  const players: PlayerIdentity[] = [
    {
      canonicalId: "s001",
      displayName: "Ari Fox",
      aliases: [],
      knownEmails: ["ari.fox@example.com"],
      leagues: ["sunday"],
      status: "regular",
    },
  ];

  it("matches case-insensitively", () => {
    expect(findPlayerByEmail(players, "Ari.Fox@EXAMPLE.com")?.canonicalId).toBe("s001");
  });

  it("returns null when no player has that email", () => {
    expect(findPlayerByEmail(players, "nobody@example.com")).toBeNull();
  });
});
