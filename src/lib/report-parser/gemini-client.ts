/**
 * Minimal Gemini API client — a plain fetch wrapper, not a full SDK, since
 * this project only ever needs one call shape (send text, get text back).
 * Server-side/local-script use only; GEMINI_API_KEY must never be
 * NEXT_PUBLIC_-prefixed or reach browser code.
 */
// Deliberately pinned to a SPECIFIC model, not the floating "gemini-flash-latest"
// alias this used to point to — confirmed via Google's own rate-limits page
// (2026-07-17) that gemini-3.1-flash-lite's free tier is 500 requests/day,
// vs. 20/day for whatever "flash-latest" currently resolves to
// (gemini-3.5-flash). Quota was the actual bottleneck on this feature, so
// the explicit pin's usual downside (needs a manual bump if Google retires
// this model — see the July 2026 404 that motivated the alias in the first
// place) is worth it here. Re-check ".../v1beta/models" (free, no quota
// cost) if this one ever 404s.
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // Without an explicit cap, a report with many goals/mentions can hit
      // Gemini's default output limit and get cut off mid-JSON (confirmed by
      // a real response missing its final closing brace) — 8192 comfortably
      // covers any report this league is realistically going to produce.
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error(
      "Gemini's response was cut off (hit the output token limit) before finishing — try again, " +
        "or if this keeps happening, the maxOutputTokens cap in gemini-client.ts needs raising further.",
    );
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Gemini API response missing expected text content: ${JSON.stringify(data)}`);
  }
  return text;
}
