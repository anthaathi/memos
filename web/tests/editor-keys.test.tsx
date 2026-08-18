import { fireEvent } from "@testing-library/react";
import type { LexicalEditor } from "lexical";
import { KEY_ENTER_COMMAND, KEY_TAB_COMMAND } from "lexical";
import { describe, expect, it } from "vitest";
import { renderEditor, type EditorHarness } from "./helpers/render-editor";

function press(harness: EditorHarness, key: string, opts: KeyboardEventInit = {}) {
  fireEvent.keyDown(harness.contentEditable()!, { key, bubbles: true, cancelable: true, ...opts });
}

/** The Lexical editor instance backing the rendered component. */
function lexicalEditor(harness: EditorHarness): LexicalEditor {
  return (harness.contentEditable() as unknown as { __lexicalEditor: LexicalEditor }).__lexicalEditor;
}

/** Dispatch a key command through the real pipeline (jsdom cannot commit key-driven updates). */
function dispatchKey(harness: EditorHarness, command: typeof KEY_ENTER_COMMAND | typeof KEY_TAB_COMMAND, event: KeyboardEvent) {
  const editor = lexicalEditor(harness);
  editor.update(
    () => {
      editor.dispatchCommand(command, event);
    },
    { discrete: true },
  );
}

describe("editor key bindings", () => {
  it("Cmd+Enter submits without editing the document", () => {
    const h = renderEditor({ initialContent: "hello" });
    h.ref.current?.setCursor(5);
    press(h, "Enter", { metaKey: true });
    expect(h.onSubmit).toHaveBeenCalledTimes(1);
    expect(h.ref.current?.getMarkdown()).toBe("hello");
  });

  it("Ctrl+Enter also submits without editing the document", () => {
    const h = renderEditor({ initialContent: "hello" });
    press(h, "Enter", { ctrlKey: true });
    expect(h.onSubmit).toHaveBeenCalledTimes(1);
    expect(h.ref.current?.getMarkdown()).toBe("hello");
  });

  it("plain Enter inserts a paragraph break instead of submitting", () => {
    const h = renderEditor({ initialContent: "hello" });
    lexicalEditor(h).focus();
    h.ref.current?.setCursor(5);
    dispatchKey(h, KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter" }));
    expect(h.onSubmit).not.toHaveBeenCalled();
    expect(h.ref.current?.getMarkdown()).toBe("hello\n");
  });

  it("Escape blurs the editor (keyboard escape hatch)", () => {
    const h = renderEditor({ initialContent: "x" });
    const editable = h.contentEditable()!;
    editable.focus();
    expect(document.activeElement).toBe(editable);
    press(h, "Escape");
    expect(document.activeElement).not.toBe(editable);
  });

  it("Tab indents two spaces on a plain line", () => {
    const h = renderEditor({ initialContent: "hello" });
    lexicalEditor(h).focus();
    h.ref.current?.setCursor(0);
    dispatchKey(h, KEY_TAB_COMMAND, new KeyboardEvent("keydown", { key: "Tab" }));
    expect(h.ref.current?.getMarkdown()).toBe("  hello");
  });

  it("Tab nests a list item and Shift-Tab outdents it", () => {
    const h = renderEditor({ initialContent: "- a\n- b" });
    lexicalEditor(h).focus();
    h.ref.current?.setCursor(6); // end of the second item
    dispatchKey(h, KEY_TAB_COMMAND, new KeyboardEvent("keydown", { key: "Tab" }));
    expect(h.ref.current?.getMarkdown()).toBe("- a\n    - b");
    dispatchKey(h, KEY_TAB_COMMAND, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(h.ref.current?.getMarkdown()).toBe("- a\n- b");
  });
});
