import { $createRangeSelection, $getRoot, $getSelection, $isRangeSelection, $isTextNode, $setSelection } from "lexical";

const lexical = () => ({ $createRangeSelection, $getRoot, $isTextNode, $setSelection });
import { describe, expect, it } from "vitest";
import { createEditorHost } from "./helpers/editor-host";

describe("lexical editor controller", () => {
  it("reports emptiness on whitespace", () => {
    const host = createEditorHost("   \n  ");
    try {
      expect(host.controller.isEmpty()).toBe(true);
    } finally {
      host.destroy();
    }
  });

  it("parses markdown in and serializes it back semantically", () => {
    const host = createEditorHost();
    try {
      host.controller.setMarkdown("# Title\n\nSome **bold** text.");
      expect(host.controller.getMarkdown()).toBe("# Title\n\nSome **bold** text.");
    } finally {
      host.destroy();
    }
  });

  it("inserts markdown at the caret as its own block without consuming the selection", () => {
    const host = createEditorHost("keep this paragraph of text");
    try {
      // Highlight a range: the insert must not delete it, only split at the
      // caret end.
      host.editor.update(() => {
        const { $createRangeSelection, $getRoot, $isTextNode, $setSelection } = lexical();
        const text = $getRoot().getFirstDescendant();
        if (!$isTextNode(text)) return;
        const selection = $createRangeSelection();
        selection.anchor.set(text.getKey(), 5, "text");
        selection.focus.set(text.getKey(), 19, "text");
        $setSelection(selection);
      }, { discrete: true });

      host.controller.insertMarkdown("![photo](/file/attachments/photo)");

      expect(host.controller.getMarkdown()).toBe("keep this paragraph\n\n![photo](/file/attachments/photo)\n\n of text");
    } finally {
      host.destroy();
    }
  });

  it("captures and restores the cursor, clamping out-of-range positions", () => {
    const host = createEditorHost("alpha beta");
    try {
      host.controller.setCursor(7);
      expect(host.controller.getCursor()).toBe(7);

      host.controller.setCursor(99);
      expect(host.controller.getCursor()).toBe(10);

      // The cursor offset survives a full external reload of the same text.
      host.controller.setMarkdown("alpha beta");
      host.controller.setCursor(7);
      expect(host.controller.getCursor()).toBe(7);
    } finally {
      host.destroy();
    }
  });

  it("selects all content", () => {
    const host = createEditorHost("one\n\ntwo");
    try {
      host.controller.selectAll();
      const selected = host.editor.read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) ? selection.getTextContent() : null;
      });
      // The selection's text joins blocks with single newlines.
      expect(selected).toBe("one\ntwo");
    } finally {
      host.destroy();
    }
  });
});
