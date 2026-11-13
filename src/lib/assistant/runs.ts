import { useEffect, useRef, useState } from "react";

/**
 * The assistant's work, one item after another: what it is reading, what
 * waits, and what went wrong. Work runs in the background; stopping
 * ends the item it is on and empties the queue.
 */

export interface RunsState {
  /** The item being read, and what the assistant is doing with it. */
  running: { path: string; step: string } | null;
  queued: string[];
  /** Why reading an item failed, by its path. */
  errors: Record<string, string>;
  /** A word on how reading an item went, by its path: what was left out. */
  notes: Record<string, string>;
}

/** Reads one item; resolves with a word on how it went, or null. */
export type Start = (
  path: string,
  signal: AbortSignal,
  progress: (step: string) => void,
) => Promise<string | null>;

const IDLE: RunsState = { running: null, queued: [], errors: {}, notes: {} };

const without = (record: Record<string, string>, key: string) => {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
};

export function useAssistantRuns(start: Start) {
  const [state, setState] = useState<RunsState>(IDLE);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const begin = useRef(start);
  // The latest `start`, for work that began before the window last drew.
  useEffect(() => {
    begin.current = start;
  });

  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (let path = queue.current.shift(); path; path = queue.current.shift()) {
        const current = path;
        const abort = new AbortController();
        controller.current = abort;
        setState((s) => ({
          ...s,
          running: { path: current, step: "Getting ready" },
          queued: [...queue.current],
          errors: without(s.errors, current),
          notes: without(s.notes, current),
        }));
        try {
          const note = await begin.current(current, abort.signal, (step) =>
            setState((s) =>
              s.running?.path === current
                ? { ...s, running: { path: current, step } }
                : s,
            ),
          );
          setState((s) => ({
            ...s,
            notes: note ? { ...s.notes, [current]: note } : s.notes,
          }));
        } catch (error) {
          if (!abort.signal.aborted) {
            const message = error instanceof Error ? error.message : String(error);
            setState((s) => ({ ...s, errors: { ...s.errors, [current]: message } }));
          }
        }
      }
    } finally {
      busy.current = false;
      controller.current = null;
      setState((s) => ({ ...s, running: null, queued: [] }));
    }
  };

  /** Puts items in the queue; ones in it or being read already stay where they are. */
  const ask = (paths: string[]) => {
    const running = state.running?.path;
    const fresh = paths.filter((p) => p !== running && !queue.current.includes(p));
    if (!fresh.length) return;
    queue.current.push(...fresh);
    setState((s) => ({ ...s, queued: [...queue.current] }));
    void pump();
  };

  /** Stops the item being read and empties the queue. */
  const stop = () => {
    queue.current = [];
    controller.current?.abort();
    setState((s) => ({ ...s, queued: [] }));
  };

  /** Forgets what went wrong with an item, or what was said about it. */
  const dismiss = (path: string) =>
    setState((s) => ({
      ...s,
      errors: without(s.errors, path),
      notes: without(s.notes, path),
    }));

  return { state, ask, stop, dismiss };
}
