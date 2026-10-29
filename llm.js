// The clone's brain. Uses Gemini if a key is set, otherwise Claude. Keys come from
// the environment only — never hard-coded, never stored in the repo.
// (Ported from the prototype app's GeminiClient / ClaudeClient, now server-side.)

const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
const CLAUDE_MODEL = "claude-opus-5-5";

export function haveKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function backendName() {
  if (process.env.GEMINI_API_KEY) return "Gemini";
  if (process.env.ANTHROPIC_API_KEY) return "Claude";
  return null;
}

// system: instruction string. messages: [{role:"user"|"model"|"assistant", text}]
export async function chat(system, messages) {
  if (process.env.GEMINI_API_KEY) return gemini(system, messages);
  if (process.env.ANTHROPIC_API_KEY) return claude(system, messages);
  throw new Error("No AI key set. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to the environment.");
}

// One-shot helpers built on chat().
export async function answer(system, prompt) {
  return chat(system, [{ role: "user", text: prompt }]);
}

// Ask the model for a strict JSON object (used by the clone worker's router).
export async function classifyJson(prompt) {
  const text = await answer(
    "You are a precise router. Reply with a single JSON object and nothing else.",
    prompt + "\nReturn ONLY the JSON object, no markdown, no prose."
  );
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(a, b + 1));
}

async function gemini(system, messages) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : m.role === "model" ? "model" : "user",
    parts: [{ text: m.text }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
  };
  let lastErr = "Gemini is unavailable.";
  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join("").trim();
      if (text) return text;
      lastErr = "Gemini returned an empty answer.";
      continue;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const msg = await safeMsg(res);
      if (/api key/i.test(msg)) throw new Error("The Gemini API key was rejected.");
      throw new Error(msg);
    }
    lastErr = res.status === 429 ? "Gemini's limit is used up for now." : "Gemini is busy; try again.";
  }
  throw new Error(lastErr);
}

async function claude(system, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system,
      messages: messages.map((m) => ({
        role: m.role === "model" ? "assistant" : m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      })),
    }),
  });
  if (!res.ok) throw new Error("Claude error: " + (await safeMsg(res)));
  const data = await res.json();
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

async function safeMsg(res) {
  try {
    const j = await res.json();
    return j?.error?.message || JSON.stringify(j);
  } catch {
    return `HTTP ${res.status}`;
  }
}
