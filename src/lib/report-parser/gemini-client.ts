/**
 * Minimal Gemini API client — a plain fetch wrapper, not a full SDK, since
 * this project only ever needs one call shape (send text, get text back).
 * Server-side/local-script use only; GEMINI_API_KEY must never be
 * NEXT_PUBLIC_-prefixed or reach browser code.
 */
// A hard-pinned dated model name (e.g. "gemini-2.5-flash") will eventually
// get cut off for new API keys even while it keeps working for existing
// ones — this app hit exactly that 404 in July 2026. "gemini-flash-latest"
// is Google's own alias for whatever their current recommended Flash model
// is, so it doesn't need to be manually bumped every time Google retires
// an old one.
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Gemini API response missing expected text content: ${JSON.stringify(data)}`);
  }
  return text;
}
