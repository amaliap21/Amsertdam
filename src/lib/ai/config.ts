export function getDefaultProviderOrder(): string[] {
	return (process.env.AI_PROVIDER_ORDER || "anthropic")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export const DEFAULT_PROVIDER_ORDER = getDefaultProviderOrder();

// Accept both old and new env keys for compatibility.
export const PROVIDER_TIMEOUT_MS = Number(
	process.env.AI_PROVIDER_TIMEOUT_MS || process.env.PROVIDER_TIMEOUT_MS || 10000,
);
export const PROVIDER_RETRY = Number(
	process.env.AI_PROVIDER_RETRY || process.env.PROVIDER_RETRY || 1,
);

// Per-provider ordered list of models for fallback.
// Environment variables are expected in the form `AI_PROVIDER_MODELS_<PROVIDER>`
// Example: AI_PROVIDER_MODELS_ANTHROPIC=claude-opus-4-7,claude-2
export function getProviderModelOrder(providerOrder: string[] = getDefaultProviderOrder()): Record<string, string[]> {
	const providerModelOrder: Record<string, string[]> = {};
	for (const p of providerOrder) {
		const key = `AI_PROVIDER_MODELS_${p.toUpperCase()}`;
		const raw = process.env[key] || process.env[`AI_PROVIDER_MODELS_${p}`] || "";
		providerModelOrder[p] = raw.split(",").map((s) => s.trim()).filter(Boolean);
	}
	return providerModelOrder;
}

export const PROVIDER_MODEL_ORDER = getProviderModelOrder(DEFAULT_PROVIDER_ORDER);

export function getModelsForProvider(provider: string): string[] {
	const currentOrder = getProviderModelOrder(getDefaultProviderOrder());
	return currentOrder[provider] ?? [];
}
