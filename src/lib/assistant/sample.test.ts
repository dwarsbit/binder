// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { placeOfHref } from "../highlights";
import { SAMPLE_BINDER, SAMPLE_FILES } from "../sample";
import { htmlPages } from "../text";
import { proposedHighlights, readAssistant } from "./file";
import { findQuote, passagesOf } from "./passages";

const text = (url: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0)),
  );

describe("the demo's assistant note", () => {
  it("rests every statement and proposed highlight on its source", () => {
    const note = readAssistant(
      SAMPLE_BINDER.pages["items/Where students read library survey 2025.assistant.md"],
    );
    const passages = passagesOf(
      htmlPages(
        text(SAMPLE_FILES["items/Where students read library survey 2025.html"]),
      ),
      false,
    );
    const links = note.parts
      .flatMap((part) => [...part.markdown.matchAll(/\]\(([^()\s]+)\)/g)])
      .map((found) => placeOfHref("items", found[1]));
    expect(links.length).toBeGreaterThan(4);
    for (const place of links)
      expect(findQuote(passages, place?.text ?? "")).not.toBeNull();
    for (const h of proposedHighlights(note))
      expect(findQuote(passages, h.text)).not.toBeNull();
  });
});
