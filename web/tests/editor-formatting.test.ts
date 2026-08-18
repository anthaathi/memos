import { $createRangeSelection, $getRoot, $isTextNode, $setSelection } from "lexical";
import { describe, expect, it } from "vitest";
import { createEditorHost, type EditorHost } from "./helpers/editor-host";

function setup(markdown: string, cursor?: number): EditorHost {
  const host = createEditorHost(markdown);
  if (cursor !== undefined) host.controller.setCursor(cursor);
  return host;
}

/** Select [from, to) inside the first text node of the document. */
function selectFirstTextNode(host: EditorHost, from: number, to: number): void {
  host.editor.update(
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

describe("formatting controller", () => {
  it("wraps a selection in bold and reports active", () => {
    const host = setup("hello world", 0);
    try {
      selectFirstTextNode(host, 0, 5);
      host.formatting.run("bold");
      expect(host.controller.getMarkdown()).toBe("**hello** world");
      host.controller.setCursor(3);
      expect(host.formatting.getActiveFormats().bold).toBe(true);
    } finally {
      host.destroy();
    }
  });

  it("prefixes a heading and reports its level", () => {
    const host = setup("Title", 0);
    try {
      host.formatting.run("heading1");
      expect(host.controller.getMarkdown()).toBe("# Title");
      host.controller.setCursor(3);
      expect(host.formatting.getActiveFormats().headingLevel).toBe(1);
    } finally {
      host.destroy();
    }
  });

  it("toggles a bullet list line on and off", () => {
    const host = setup("item", 0);
    try {
      host.formatting.run("bulletList");
      expect(host.controller.getMarkdown()).toBe("- item");
      host.formatting.run("bulletList");
      expect(host.controller.getMarkdown()).toBe("item");
    } finally {
      host.destroy();
    }
  });

  it("unbolds when the cursor already sits in bold text", () => {
    const host = setup("Some **bold** text.", 7);
    try {
      expect(host.formatting.getActiveFormats().bold).toBe(true);
      host.formatting.run("bold");
      expect(host.controller.getMarkdown()).toBe("Some bold text.");
    } finally {
      host.destroy();
    }
  });

  it("toggles a task list and reports it active", () => {
    const host = setup("task", 0);
    try {
      host.formatting.run("taskList");
      expect(host.controller.getMarkdown()).toBe("- [ ] task");
      expect(host.formatting.getActiveFormats().taskList).toBe(true);
    } finally {
      host.destroy();
    }
  });

  it("toggles a fenced code block around the selection", () => {
    const host = setup("first\nsecond");
    try {
      host.controller.selectAll();
      host.formatting.run("codeBlock");
      expect(host.controller.getMarkdown()).toBe("```\nfirst\nsecond\n```");
      expect(host.formatting.getActiveFormats().codeBlock).toBe(true);

      host.formatting.run("codeBlock");
      expect(host.controller.getMarkdown()).toBe("first\nsecond");
    } finally {
      host.destroy();
    }
  });
});
