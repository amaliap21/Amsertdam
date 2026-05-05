/**
 * Ollama integration for local LLM inference
 * Uses Llama 3.1 8B running locally via Ollama
 * API runs on http://localhost:11434 by default
 */

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

export interface OllamaStreamResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
}

/**
 * Call Ollama API with messages (non-streaming)
 * Pass jsonMode=true to force the model to return strict JSON.
 */
export async function callOllama(
  messages: OllamaMessage[],
  opts: { jsonMode?: boolean } = {},
): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        ...(opts.jsonMode ? { format: 'json' } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data: OllamaResponse = await response.json();
    return data.message.content;
  } catch (error) {
    throw new Error(`Failed to call Ollama: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Call Ollama API with streaming enabled
 * Yields text deltas as they arrive
 */
export async function* streamOllama(messages: OllamaMessage[]): AsyncGenerator<string> {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Process complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const data: OllamaStreamResponse = JSON.parse(line);
            yield data.message.content;
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }

      // Keep incomplete line in buffer
      buffer = lines[lines.length - 1];
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const data: OllamaStreamResponse = JSON.parse(buffer);
        yield data.message.content;
      } catch (e) {
        // Skip
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to stream from Ollama: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract JSON from LLM response text.
 * - Strips markdown fences
 * - Supports either object {...} or array [...] roots
 * - Tolerates trailing commas, single quotes around keys/strings, and unquoted keys
 */
export function extractFirstJson<T = Record<string, any>>(text: string): T {
  if (!text || typeof text !== 'string') {
    throw new Error('No JSON object found in response');
  }

  // Strip markdown code fences
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = (codeBlockMatch ? codeBlockMatch[1] : text).trim();

  // Find earliest of '{' or '['
  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');
  let startIdx: number;
  let openCh: string;
  let closeCh: string;
  if (firstObj === -1 && firstArr === -1) {
    throw new Error('No JSON object found in response');
  }
  if (firstObj === -1 || (firstArr !== -1 && firstArr < firstObj)) {
    startIdx = firstArr;
    openCh = '[';
    closeCh = ']';
  } else {
    startIdx = firstObj;
    openCh = '{';
    closeCh = '}';
  }

  // Walk through string respecting string literals (with escapes)
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
      if (ch === '\\') {
        escape = true;
      } else if (ch === inStr) {
        inStr = null;
      }
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
  if (endIdx === -1) {
    throw new Error('Malformed JSON in response');
  }

  let jsonStr = candidate.substring(startIdx, endIdx + 1);

  // Try strict parse first
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Sanitize: trailing commas, single-quoted strings, unquoted keys
    let sanitized = jsonStr
      // remove trailing commas before } or ]
      .replace(/,\s*([}\]])/g, '$1');

    // Replace single-quoted string values/keys with double-quoted (best-effort)
    sanitized = sanitized.replace(
      /'((?:[^'\\]|\\.)*)'/g,
      (_m, inner: string) => '"' + inner.replace(/"/g, '\\"') + '"',
    );

    // Quote unquoted object keys: { foo: ... } => { "foo": ... }
    sanitized = sanitized.replace(
      /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
      '$1"$2":',
    );

    return JSON.parse(sanitized) as T;
  }
}

/**
 * Convert a file to base64 for Ollama
 * Note: Ollama's native chat API doesn't support images/files like Claude does.
 * For file-based tasks, we extract text or describe the file to the model.
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Build a system prompt for file-based analysis
 * Since Ollama doesn't support image/PDF uploads in the chat API,
 * we include instructions about how the user will provide file content
 */
export function buildFileAnalysisPrompt(filename: string, fileDescription: string): string {
  return `You are an AI assistant designed to analyze content from files.
The user has uploaded: ${filename}
${fileDescription}

Please analyze the provided content and respond with valid JSON.
Make sure all responses are wrapped in a single JSON object.`;
}

export const OLLAMA_MODEL_NAME = OLLAMA_MODEL;
export const OLLAMA_URL = OLLAMA_API_URL;
