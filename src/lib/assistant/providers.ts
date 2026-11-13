import { isDesktop } from "@cursive/editor/lib/platform";

/**
 * Where the assistant runs: a provider with your own key, or a model on
 * your computer. The presets are Polemic's (dwarsbit/polemic,
 * src/lib/ai-providers.ts): each speaks the OpenAI chat API.
 */
export interface Provider {
  id: string;
  name: string;
  /** The OpenAI-compatible base address, up to /v1; null for "custom", where you type one. */
  baseUrl: string | null;
  /** A model on your computer runs without a key. */
  needsKey: boolean;
  /** The host your material goes to; null for a model on your computer. */
  host: string | null;
  /** Models to start from, the first the suggestion. */
  models: string[];
  /** Where you get a key. */
  keyUrl: string | null;
}

export const PROVIDERS: Provider[] = [
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    host: "api.mistral.ai",
    models: ["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest"],
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    host: "api.openai.com",
    models: ["gpt-5-mini", "gpt-5", "gpt-4.1"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    host: "api.anthropic.com",
    models: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    host: null,
    models: [],
    keyUrl: null,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    host: null,
    models: [],
    keyUrl: null,
  },
  {
    id: "custom",
    name: "Other",
    baseUrl: null,
    needsKey: false,
    host: null,
    models: [],
    keyUrl: null,
  },
];

export const providerById = (id: string | null | undefined): Provider | null =>
  PROVIDERS.find((provider) => provider.id === id) ?? null;

/** The assistant's settings, kept by this computer. The key is kept apart, in the system's credential store. */
export interface AssistantSettings {
  provider: string | null;
  baseUrl: string;
  model: string;
  /** Whether the assistant reads new sources as they come in. */
  auto: boolean;
}

export const NO_ASSISTANT: AssistantSettings = {
  provider: null,
  baseUrl: "",
  model: "",
  auto: true,
};

/** The host of an address; empty when it isn't one. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Whether an address is on this computer. */
export function isLocalUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return (
      (protocol === "http:" || protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Where your material goes, for the settings and for the mark on what
 * the assistant wrote: null when the model runs on this computer.
 */
export function receiverOf(settings: AssistantSettings): string | null {
  if (!settings.provider || isLocalUrl(settings.baseUrl)) return null;
  const provider = providerById(settings.provider);
  const host = hostOf(settings.baseUrl);
  if (provider && provider.id !== "custom") return `${provider.name} (${host})`;
  return host || null;
}

/** The provider as the file names it: its name, or "this computer". */
export function providerLabel(settings: AssistantSettings): string {
  if (isLocalUrl(settings.baseUrl)) return "this computer";
  const provider = providerById(settings.provider);
  return provider && provider.id !== "custom"
    ? provider.name
    : hostOf(settings.baseUrl) || "a provider";
}

/**
 * Whether the assistant can run here: a provider, an address and a
 * model. In the browser only a model on this computer can be reached:
 * providers don't answer a web page, and a key has no safe place there.
 */
export function canRun(settings: AssistantSettings): boolean {
  if (!settings.provider || !settings.baseUrl.trim() || !settings.model.trim())
    return false;
  return isDesktop || isLocalUrl(settings.baseUrl);
}

/** Providers that can be chosen here. */
export const choosable = (): Provider[] =>
  isDesktop ? PROVIDERS : PROVIDERS.filter((provider) => !provider.needsKey);

const KEY = "binder.assistant";

export function loadAssistant(): AssistantSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as Partial<AssistantSettings>) : null;
    if (value && typeof value === "object") {
      return {
        provider: typeof value.provider === "string" ? value.provider : null,
        baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : "",
        model: typeof value.model === "string" ? value.model : "",
        auto: value.auto !== false,
      };
    }
  } catch {
    // Storage is off: the assistant is off too.
  }
  return NO_ASSISTANT;
}

const listeners = new Set<() => void>();

export function saveAssistant(settings: AssistantSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is full or off: the settings last until the window closes.
  }
  current = settings;
  listeners.forEach((listener) => listener());
}

let current: AssistantSettings | null = null;

/** The settings, for `useSyncExternalStore`. */
export const assistantSnapshot = (): AssistantSettings => (current ??= loadAssistant());
export const subscribeAssistant = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
