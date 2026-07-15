import { describe, expect, it } from "vitest";
import { formatMatchDateLabel, formatPlusMinus, formatScoreLine, formatWDL, truncate } from "../format";

describe("formatMatchDateLabel", () => {
  it("formats a date-only ISO string in UTC regardless of local time zone", () => {
    // 2026-07-12 is a Sunday. If this were parsed in local time on a
    // negative-UTC-offset machine, it could shift back to Saturday.
    expect(formatMatchDateLabel("2026-07-12")).toBe("SUN JUL 12");
    expect(formatMatchDateLabel("2026-07-11")).toBe("SAT JUL 11");
  });
});

describe("formatScoreLine", () => {
  it("joins two scores with an en dash", () => {
    expect(formatScoreLine(2, 4)).toBe("2 – 4");
  });
});

describe("formatWDL", () => {
  it("joins wins-ties-losses in that order", () => {
    expect(formatWDL(18, 6, 11)).toBe("18-6-11");
  });
});

describe("formatPlusMinus", () => {
  it("prefixes positive values with a plus sign", () => {
    expect(formatPlusMinus(7)).toBe("+7");
  });

  it("leaves zero and negative values unprefixed", () => {
    expect(formatPlusMinus(0)).toBe("0");
    expect(formatPlusMinus(-3)).toBe("-3");
  });
});

describe("truncate", () => {
  it("leaves text at or under the limit unchanged", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("exactlyten", 10)).toBe("exactlyten");
  });

  it("truncates text over the limit and appends an ellipsis", () => {
    expect(truncate("this is a long sentence", 10)).toBe("this is a...");
  });
});
