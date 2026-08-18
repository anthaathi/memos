import { fireEvent, waitFor } from "@testing-library/react";
import { $createRangeSelection, $getRoot, $isTextNode, $setSelection, type LexicalEditor } from "lexical";
import { describe, expect, it } from "vitest";
import { renderEditor, type EditorHarness } from "./helpers/render-editor";

const toolbar = () => document.querySelector<HTMLDivElement>(".memo-selection-toolbar");
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".memo-selection-toolbar-button"));
// Repo convention: t echoes the i18n key in tests, so accessible names are keys.
const BOLD = "editor.format.bold";
const boldButton = () => buttons().find((button) => button.getAttribute("aria-label") === BOLD) ?? null;

/** The Lexical editor behind the rendered component. */
function lexicalEditor(harness: EditorHarness): LexicalEditor {
  return (harness.contentEditable() as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor;
}

/** Highlight [from, to) inside the document's first text node. */
function selectRange(harness: EditorHarness, from: number, to: number) {
  lexicalEditor(harness).update(
    () => {
      const text = $getRoot().getFirstDescendant();
      if (!$isTextNode(text)) return;
      const selection = $createRangeSelection();
      selection.anchor.set(text.getKey(), from, "text");
      selection.focus.set(text.getKey(), to, "text");
      $setSelection(selection);
    },
    { discrete: true },
  );
}

describe("selection toolbar", () => {
  it("stays hidden while the caret is collapsed", () => {
    const h = renderEditor({ initialContent: "hello world" });
    h.ref.current?.setCursor(3);
    expect(toolbar()).toBeNull();
  });

  it("appears for a text selection and applies a mark", async () => {
    const h = renderEditor({ initialContent: "hello world" });
    selectRange(h, 0, 5);
    await waitFor(() => expect(toolbar()).not.toBeNull());
    expect(buttons().map((button) => button.getAttribute("aria-label"))).toEqual([
      "editor.format.bold",
      "editor.format.italic",
      "editor.format.strikethrough",
      "editor.format.code",
    ]);

    const bold = boldButton();
    expect(bold?.getAttribute("aria-pressed")).toBe("false");
    fireEvent.mouseDown(bold!);
    fireEvent.click(bold!);

    await waitFor(() => expect(h.ref.current?.getMarkdown()).toBe("**hello** world"));
    // The toolbar stays up over the (still highlighted) selection and now
    // reports bold as active.
    await waitFor(() => expect(boldButton()?.getAttribute("aria-pressed")).toBe("true"));
  });

  it("hides when the selection collapses again", async () => {
    const h = renderEditor({ initialContent: "hello world" });
    selectRange(h, 0, 5);
    await waitFor(() => expect(toolbar()).not.toBeNull());

    h.ref.current?.setCursor(0);
    await waitFor(() => expect(toolbar()).toBeNull());
  });

  it("never appears inside a code block", () => {
    const h = renderEditor({ initialContent: "```\nsome code\n```" });
    const editor = lexicalEditor(h);
    editor.update(
      () => {
        const text = $getRoot().getFirstDescendant();
        if (!$isTextNode(text)) return;
        const selection = $createRangeSelection();
        selection.anchor.set(text.getKey(), 0, "text");
        selection.focus.set(text.getKey(), 4, "text");
        $setSelection(selection);
      },
      { discrete: true },
    );
    expect(toolbar()).toBeNull();
  });
});
