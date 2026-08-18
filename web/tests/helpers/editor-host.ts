import { registerHistory, createEmptyHistoryState } from "@lexical/history";
import { registerCheckList, registerList } from "@lexical/list";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { registerRichText } from "@lexical/rich-text";
import { createEditor, type LexicalEditor } from "lexical";
import { createController } from "@/components/MemoEditor/Editor/controller";
import { createFormattingController } from "@/components/MemoEditor/Editor/formatting";
import { MEMO_TRANSFORMERS } from "@/components/MemoEditor/Editor/markdown";
import { MEMO_EDITOR_NODES } from "@/components/MemoEditor/Editor/nodes";
import { registerTagMentionStyling } from "@/components/MemoEditor/Editor/tagStyling";
import { memoEditorTheme } from "@/components/MemoEditor/Editor/theme";
import type { EditorController, FormattingController } from "@/components/MemoEditor/types/editorController";

export interface EditorHost {
  editor: LexicalEditor;
  controller: EditorController;
  formatting: FormattingController;
  /** The element Lexical renders into. */
  host: HTMLElement;
  destroy(): void;
}

/**
 * A DOM-bound editor wired like the real one (same nodes, theme, and
 * registrations), for exercising the controller/markdown layers directly.
 */
export function createEditorHost(markdown = ""): EditorHost {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createEditor({
    namespace: "test-editor",
    nodes: MEMO_EDITOR_NODES,
    theme: memoEditorTheme,
    onError: (error) => {
      throw error;
    },
  });
  editor.setRootElement(host);
  editor.focus();
  const unregister = [
    registerRichText(editor),
    registerList(editor),
    registerCheckList(editor),
    registerHistory(editor, createEmptyHistoryState(), 350),
    registerMarkdownShortcuts(editor, MEMO_TRANSFORMERS),
    registerTagMentionStyling(editor),
  ];
  const formatting = createFormattingController(editor, new Set());
  const controller = createController(editor, formatting);
  if (markdown) {
    controller.setMarkdown(markdown);
    editor.focus();
  }
  return {
    editor,
    controller,
    formatting,
    host,
    destroy: () => {
      for (const fn of unregister) fn();
      editor.setRootElement(null);
      host.remove();
    },
  };
}
