/**
 * Anthropic Claude integration via the Messages API (no SDK dep).
 * Drop-in replacement for the previous Ollama helper.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface CallOptions {
  jsonMode?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(
  messages: ChatMessage[],
  opts: CallOptions = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment");
  }

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  let system = systemParts.join("\n\n").trim();
  if (opts.jsonMode) {
    system = (
      system +
      "\n\nRespond with a single valid JSON object only. No prose, no markdown fences."
    ).trim();
  }

  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    messages: conversation,
  };
  if (system) body.system = system;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  const data = await response.json();
  const blocks: { type: string; text?: string }[] = data.content ?? [];
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Stream text deltas from Claude using server-sent events.
 */
export async function* streamClaude(
  messages: ChatMessage[],
  opts: CallOptions = {},
): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment");
  }

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    messages: conversation,
    stream: true,
  };
  const system = systemParts.join("\n\n").trim();
  if (system) body.system = system;
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(
      `Anthropic stream error ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        if (
          parsed.type === "content_block_delta" &&
          parsed.delta?.type === "text_delta" &&
          typeof parsed.delta.text === "string"
        ) {
          yield parsed.delta.text as string;
        }
      } catch {
        // skip malformed events
      }
    }
  }
}

/**
 * Extract JSON from a model response (object or array root, tolerant of
 * trailing commas, single quotes, unquoted keys, and surrounding prose).
 */
export function extractFirstJson<T = Record<string, unknown>>(text: string): T {
  if (!text || typeof text !== "string") {
    throw new Error("No JSON object found in response");
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (codeBlockMatch ? codeBlockMatch[1] : text).trim();

  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  let startIdx: number;
  let openCh: string;
  let closeCh: string;
  if (firstObj === -1 && firstArr === -1) {
    throw new Error("No JSON object found in response");
  }
  if (firstObj === -1 || (firstArr !== -1 && firstArr < firstObj)) {
    startIdx = firstArr;
    openCh = "[";
    closeCh = "]";
  } else {
    startIdx = firstObj;
    openCh = "{";
    closeCh = "}";
  }

  let depth = 0;
  let endIdx = -1;
  let inStr: '"' | "'" | null = null;
  let escape = false;
  for (let i = startIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") escape = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) throw new Error("Malformed JSON in response");

  const jsonStr = candidate.substring(startIdx, endIdx + 1);

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    let sanitized = jsonStr.replace(/,\s*([}\]])/g, "$1");
    sanitized = sanitized.replace(
      /'((?:[^'\\]|\\.)*)'/g,
      (_m, inner: string) => '"' + inner.replace(/"/g, '\\"') + '"',
    );
    sanitized = sanitized.replace(
      /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
      '$1"$2":',
    );
    return JSON.parse(sanitized) as T;
  }
}
