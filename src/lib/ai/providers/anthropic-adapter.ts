import { callClaude } from "@/lib/anthropic";

export const anthropicAdapter = {
  name: "anthropic",
  async generate(messages: {role: string; content: string}[], opts: {jsonMode?: boolean; model?: string; maxTokens?: number} = {}) {
    const res = await callClaude(messages as any, { jsonMode: opts.jsonMode, model: opts.model, maxTokens: opts.maxTokens });
    return { content: res, model: opts.model || undefined };
  },
};
