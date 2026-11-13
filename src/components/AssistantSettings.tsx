import { Loader2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isDesktop, openExternal } from "@cursive/editor/lib/platform";
import { BUTTON } from "@cursive/editor/components/Dialog";
import {
  assistantSnapshot,
  choosable,
  isLocalUrl,
  NO_ASSISTANT,
  providerById,
  receiverOf,
  saveAssistant,
  subscribeAssistant,
  type AssistantSettings as Settings,
} from "@/lib/assistant/providers";
import { hasKey, listModels, setKey } from "@/lib/assistant/transport";

const FIELD =
  "h-7 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring";
const OTHER = "__other__";

type Loaded =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; models: string[] }
  | { state: "error"; message: string };

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The assistant's settings: a provider with your own key, or a model on
 * this computer, and whether this binder lets it in. Says where your
 * material goes.
 */
export function AssistantSettings({
  binderOn,
  onBinderOn,
}: {
  binderOn: boolean;
  onBinderOn: (on: boolean) => void;
}) {
  const settings = useSyncExternalStore(subscribeAssistant, assistantSnapshot);
  const provider = providerById(settings.provider);
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });
  const [keyKept, setKeyKept] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = (next: Partial<Settings>) => saveAssistant({ ...settings, ...next });

  // Whether a key is kept for the provider: asked of the credential store.
  useEffect(() => {
    let current = true;
    if (provider && isDesktop)
      void hasKey(provider.id).then((kept) => current && setKeyKept(kept));
    return () => {
      current = false;
    };
  }, [provider]);

  const load = async (from: Settings) => {
    if (!from.baseUrl.trim()) return;
    setLoaded({ state: "loading" });
    try {
      setLoaded({ state: "ok", models: await listModels(from) });
    } catch (error) {
      setLoaded({ state: "error", message: messageOf(error) });
    }
  };

  const choose = (id: string) => {
    const next = providerById(id);
    setLoaded({ state: "idle" });
    setTyping(false);
    setKeyKept(null);
    if (!next) {
      saveAssistant({ ...NO_ASSISTANT, auto: settings.auto });
      return;
    }
    const saved: Settings = {
      ...settings,
      provider: next.id,
      baseUrl: next.baseUrl ?? "",
      model: next.models[0] ?? "",
    };
    saveAssistant(saved);
    if (!next.needsKey && next.baseUrl) void load(saved);
  };

  const keepKey = async (value: string) => {
    if (!provider || !value.trim()) return;
    setProblem(null);
    try {
      await setKey(provider.id, value);
      setKeyKept(true);
      void load(settings);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const forgetKey = async () => {
    if (!provider) return;
    try {
      await setKey(provider.id, "");
      setKeyKept(false);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const known = provider?.models ?? [];
  const fetched = loaded.state === "ok" ? loaded.models : [];
  const options = [...known, ...fetched.filter((m) => !known.includes(m))];
  const listed = settings.model !== "" && options.includes(settings.model);
  const other = typing || (settings.model !== "" && !listed);
  const receiver = receiverOf(settings);
  const local = provider !== null && !provider.needsKey && provider.id !== "custom";

  return (
    <section>
      <h3 className="text-[13px] font-medium">Assistant</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The assistant reads your sources and proposes what they are, sums them up for
        your research question and proposes highlights. It is off until you choose a
        provider or a model on this computer.
        {!isDesktop &&
          " In the browser it works with a model on this computer; for a provider, use the desktop app."}
      </p>
      <div className="settings-grid mt-2">
        <label htmlFor="assistant-provider">Provider</label>
        <select
          id="assistant-provider"
          className={FIELD}
          value={provider?.id ?? ""}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">Off</option>
          {choosable().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {!p.needsKey && p.id !== "custom" ? " (on this computer)" : ""}
            </option>
          ))}
        </select>

        {provider?.id === "custom" && (
          <>
            <label htmlFor="assistant-url">Address</label>
            <input
              id="assistant-url"
              key={`url:${settings.baseUrl}`}
              className={FIELD}
              placeholder="https://example.com/v1"
              defaultValue={settings.baseUrl}
              onBlur={(event) => {
                const baseUrl = event.target.value.trim();
                if (baseUrl !== settings.baseUrl) save({ baseUrl });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </>
        )}

        {provider && isDesktop && (provider.needsKey || provider.id === "custom") && (
          <>
            <label htmlFor="assistant-key">API key</label>
            <div className="flex items-center gap-2">
              <input
                id="assistant-key"
                key={`key:${provider.id}:${keyKept}`}
                type="password"
                autoComplete="off"
                className={FIELD}
                placeholder={
                  keyKept
                    ? "A key is kept"
                    : provider.needsKey
                      ? "Paste your key"
                      : "None"
                }
                onBlur={(event) => void keepKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              {keyKept && (
                <button
                  type="button"
                  className="h-7 flex-none text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void forgetKey()}
                >
                  Forget
                </button>
              )}
            </div>
          </>
        )}

        {provider && (
          <>
            <label htmlFor="assistant-model">Model</label>
            <div className="flex flex-col gap-1.5">
              <select
                id="assistant-model"
                className={FIELD}
                value={other ? OTHER : listed ? settings.model : ""}
                onChange={(event) => {
                  if (event.target.value === OTHER) {
                    setTyping(true);
                    return;
                  }
                  setTyping(false);
                  save({ model: event.target.value });
                }}
              >
                <option value="" disabled>
                  Choose a model
                </option>
                {options.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={OTHER}>Other…</option>
              </select>
              {other && (
                <input
                  key={`model:${settings.model}`}
                  className={FIELD}
                  aria-label="Model name"
                  placeholder="Model name"
                  autoFocus={typing}
                  defaultValue={listed ? "" : settings.model}
                  onBlur={(event) => {
                    const model = event.target.value.trim();
                    if (model && model !== settings.model) save({ model });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>

      {provider && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <button
            type="button"
            className={BUTTON}
            disabled={loaded.state === "loading" || !settings.baseUrl.trim()}
            onClick={() => void load(settings)}
          >
            {loaded.state === "loading" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Checking…
              </span>
            ) : (
              "Check the connection"
            )}
          </button>
          <span
            role="status"
            className={
              loaded.state === "error" ? "text-destructive" : "text-muted-foreground"
            }
          >
            {loaded.state === "ok"
              ? `Connected. ${loaded.models.length === 1 ? "1 model" : `${loaded.models.length} models`} to choose from.`
              : loaded.state === "error"
                ? local
                  ? `${provider.name} didn't answer. Is it running?`
                  : loaded.message
                : ""}
          </span>
          {provider.keyUrl && (
            <button
              type="button"
              className="text-tint-foreground underline-offset-2 hover:underline"
              onClick={() => openExternal(provider.keyUrl!)}
            >
              Get a key
            </button>
          )}
        </div>
      )}

      {provider && (
        <p className="mt-2 text-xs text-muted-foreground">
          {!isDesktop && !isLocalUrl(settings.baseUrl)
            ? "In the browser, the assistant needs an address on this computer, such as http://localhost:11434/v1."
            : receiver
              ? `The text of the sources the assistant reads goes to ${receiver}. Your key is kept in your system's credential store and sent only there.`
              : "The model runs on this computer. Nothing leaves it."}
        </p>
      )}
      {problem && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          className="size-3.5 accent-[var(--tint)]"
          checked={settings.auto}
          disabled={!provider}
          onChange={(event) => save({ auto: event.target.checked })}
        />
        Read new sources as they come in
      </label>
      <label className="mt-1 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          className="size-3.5 accent-[var(--tint)]"
          checked={binderOn}
          onChange={(event) => onBinderOn(event.target.checked)}
        />
        Use the assistant in this binder
      </label>
    </section>
  );
}
