import { PROVIDER_TIMEOUT_MS, PROVIDER_RETRY, getDefaultProviderOrder, getModelsForProvider } from "./config";
import { anthropicAdapter } from "./providers/anthropic-adapter";
import { openrouterAdapter } from "./providers/openrouter-adapter";
import { huggingfaceAdapter } from "./providers/huggingface-adapter";
import {
  normalizeAnthropicQuiz,
  normalizeAnthropicFlashcards,
  normalizeOpenRouterQuiz,
  normalizeOpenRouterFlashcards,
  normalizeHfQuiz,
  normalizeHfFlashcards,
} from "./normalizers";
import { validateQuizPayload, validateFlashcardPayload } from "./validator";
import { cacheGet, cacheSet } from "./cache";
import { inc } from "./metrics";

type Provider = { name: string; generate: (messages: {role:string;content:string}[], opts?: any) => Promise<{content:string; model?:string}> };

const BUILTIN_PROVIDERS: Record<string, Provider> = {
  anthropic: anthropicAdapter,
  openrouter: openrouterAdapter as any,
  huggingface: huggingfaceAdapter as any,
};

export async function generateQuizWithProviders(messages: {role:string;content:string}[], providerOrder = getDefaultProviderOrder()) {
  for (const name of providerOrder) {
    const provider = BUILTIN_PROVIDERS[name];
    if (!provider) continue;
    const models = getModelsForProvider(name);
    const modelsToTry = (models && models.length) ? models : [undefined];
    for (const model of modelsToTry) {
      const cacheKey = `quiz:${name}:${model ?? 'default'}:${messages.map(m=>m.role+':'+m.content).join('||')}`;
      const cached = cacheGet<any>(cacheKey);
      if (cached) {
        inc('router.cache.hit');
        return { ok: true, provider: 'cache', model: cached.model, payload: cached.payload };
      }
      let attempt = 0;
      while (attempt <= PROVIDER_RETRY) {
        attempt++;
        inc(`provider.call.${name}`);
        try {
          const resp = await Promise.race([
            provider.generate(messages, { jsonMode: true, model }),
            new Promise((_r, rej) => setTimeout(() => rej(new Error("timeout")), PROVIDER_TIMEOUT_MS)),
          ]) as {content:string; model?:string};
          let parsed = null;
          if (name === 'anthropic') parsed = normalizeAnthropicQuiz(resp.content);
          else if (name === 'openrouter') parsed = normalizeOpenRouterQuiz(resp.content);
          else if (name === 'huggingface') parsed = normalizeHfQuiz(resp.content);
          else parsed = normalizeAnthropicQuiz(resp.content);
          if (parsed && validateQuizPayload(parsed)) {
            inc(`provider.success.${name}`);
            cacheSet(cacheKey, { payload: parsed, model: resp.model });
            return { ok: true, provider: name, model: resp.model, payload: parsed };
          }
          // invalid parse → try next model or provider
          inc(`provider.invalid.${name}`);
          break;
        } catch (err) {
          inc(`provider.error.${name}`);
          // transient -> retry or next model/provider
          if (attempt > PROVIDER_RETRY) break;
        }
      }
    }
  }
  return { ok: false };
}

export async function generateFlashcardsWithProviders(messages: {role:string;content:string}[], providerOrder = getDefaultProviderOrder()) {
  for (const name of providerOrder) {
    const provider = BUILTIN_PROVIDERS[name];
    if (!provider) continue;
    const models = getModelsForProvider(name);
    const modelsToTry = (models && models.length) ? models : [undefined];
    for (const model of modelsToTry) {
      const cacheKey = `flashcards:${name}:${model ?? 'default'}:${messages.map(m=>m.role+':'+m.content).join('||')}`;
      const cached = cacheGet<any>(cacheKey);
      if (cached) {
        inc('router.cache.hit');
        return { ok: true, provider: 'cache', model: cached.model, payload: cached.payload };
      }
      let attempt = 0;
      while (attempt <= PROVIDER_RETRY) {
        attempt++;
        inc(`provider.call.${name}`);
        try {
          const resp = await Promise.race([
            provider.generate(messages, { jsonMode: true, model }),
            new Promise((_r, rej) => setTimeout(() => rej(new Error("timeout")), PROVIDER_TIMEOUT_MS)),
          ]) as {content:string; model?:string};
          let parsed = null;
          if (name === 'anthropic') parsed = normalizeAnthropicFlashcards(resp.content);
          else if (name === 'openrouter') parsed = normalizeOpenRouterFlashcards(resp.content);
          else if (name === 'huggingface') parsed = normalizeHfFlashcards(resp.content);
          else parsed = normalizeAnthropicFlashcards(resp.content);
          if (parsed && validateFlashcardPayload(parsed)) {
            inc(`provider.success.${name}`);
            cacheSet(cacheKey, { payload: parsed, model: resp.model });
            return { ok: true, provider: name, model: resp.model, payload: parsed };
          }
          inc(`provider.invalid.${name}`);
          break;
        } catch (err) {
          inc(`provider.error.${name}`);
          if (attempt > PROVIDER_RETRY) break;
        }
      }
    }
  }
  return { ok: false };
}
