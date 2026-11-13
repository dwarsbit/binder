import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "@cursive/editor/lib/platform";
import type { AssistantSettings } from "./providers";

/**
 * Talking to the model. The desktop app asks from Rust, which keeps the
 * key and reaches any provider; the browser asks a model on this
 * computer directly.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Asks the model once and gives its answer. Rejects when `signal` aborts. */
export type Complete = (
  messages: ChatMessage[],
  signal: AbortSignal,
) => Promise<string>;

const aborted = () => new DOMException("The assistant was stopped.", "AbortError");

/** Errors from Rust come as strings. */
const errorOf = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

let nextRequest = 1;

/** The answer of a provider that speaks the OpenAI chat API, from its JSON. */
export function answerOf(body: unknown): string {
  const choice = (body as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  // Some providers send the content in parts.
  if (Array.isArray(content))
    return content
      .map((part: { text?: unknown }) =>
        typeof part?.text === "string" ? part.text : "",
      )
      .join("");
  throw new Error(
    "The model gave an answer Binder can't read. Check the address and the model.",
  );
}

/** How the assistant asks the model these settings name. */
export function completer(settings: AssistantSettings): Complete {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  const model = settings.model.trim();
  if (isDesktop) {
    return async (messages, signal) => {
      if (signal.aborted) throw aborted();
      const requestId = nextRequest++;
      const stop = () => void invoke("assistant_cancel", { requestId }).catch(() => {});
      signal.addEventListener("abort", stop);
      try {
        return await invoke<string>("assistant_complete", {
          args: { provider: settings.provider, baseUrl, model, messages, requestId },
        });
      } catch (error) {
        if (signal.aborted) throw aborted();
        throw errorOf(error);
      } finally {
        signal.removeEventListener("abort", stop);
      }
    };
  }
  return async (messages, signal) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false }),
        signal,
      });
    } catch {
      if (signal.aborted) throw aborted();
      throw new Error(
        `The model at ${baseUrl} didn't answer. Is it running, and does it accept requests from this page?`,
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = (body as { error?: { message?: string } | string })?.error;
      const message = typeof detail === "string" ? detail : detail?.message;
      throw new Error(
        `The model answered ${response.status}${message ? `: ${message}` : "."}`,
      );
    }
    return answerOf(body);
  };
}

/** The models a provider offers. Also checks the connection and the key. */
export async function listModels(settings: AssistantSettings): Promise<string[]> {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  if (isDesktop) {
    return invoke<string[]>("assistant_models", {
      provider: settings.provider,
      baseUrl,
    }).catch((error: unknown) => {
      throw errorOf(error);
    });
  }
  const response = await fetch(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`The model answered ${response.status}.`);
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return [
    ...new Set(
      (body.data ?? []).map((model) => model.id).filter((id) => typeof id === "string"),
    ),
  ].sort() as string[];
}

/** Whether a key is kept for a provider. Desktop only. */
export const hasKey = (provider: string) =>
  isDesktop
    ? invoke<boolean>("assistant_key_exists", { provider }).catch(() => false)
    : Promise.resolve(false);

/** Keeps a provider's key in the system's credential store, or takes it out when empty. */
export const setKey = (provider: string, key: string) =>
  invoke<void>(key.trim() ? "assistant_key_set" : "assistant_key_delete", {
    provider,
    ...(key.trim() ? { key: key.trim() } : {}),
  }).catch((error: unknown) => {
    throw errorOf(error);
  });
