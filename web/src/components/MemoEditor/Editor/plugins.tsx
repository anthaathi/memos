import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { $isListItemNode, registerCheckList, registerList } from "@lexical/list";
import { registerMarkdownShortcuts } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { registerRichText } from "@lexical/rich-text";
import {
  $findMatchingParent,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  DROP_COMMAND,
  INDENT_CONTENT_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  mergeRegister,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  type PasteCommandType,
} from "lexical";
import { useLayoutEffect } from "react";
import { MEMO_TRANSFORMERS, stateToMarkdown } from "./markdown";
import { TagAutocompletePlugin } from "./tagAutocomplete";
import { registerTagMentionStyling } from "./tagStyling";

export interface EditorPluginsOptions {
  onChange: (markdown: string) => void;
  /** Fired on every update (doc or selection) so toolbar state stays live. */
  onUpdate: () => void;
  onFiles: (files: File[]) => void;
  onSubmit: () => void;
  /** True while programmatic external content is being applied. */
  isApplyingExternal: () => boolean;
  getTags: () => string[];
}

function clipboardFiles(event: PasteCommandType extends never ? never : ClipboardEvent): File[] {
  const clipboard = event.clipboardData;
  if (!clipboard) return [];
  const itemFiles = Array.from(clipboard.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return itemFiles.length > 0 ? itemFiles : Array.from(clipboard.files);
}

/** Move the caret to the drop point (best effort; browsers vary). */
function placeCaretAtPoint(editor: LexicalEditor, x: number, y: number): void {
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  if (typeof doc.caretRangeFromPoint !== "function") return;
  const domRange = doc.caretRangeFromPoint(x, y);
  if (!domRange) return;
  editor.update(() => {
    const container = domRange.startContainer;
    const node = $getNearestNodeFromDOMNode(container);
    if (!node) return;
    if ($isTextNode(node)) {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.anchor.set(node.getKey(), domRange.startOffset, "text");
        selection.focus.set(node.getKey(), domRange.startOffset, "text");
      }
    }
  });
}

/**
 * Registers the editor's behavior: rich-text/list/check-list handling, undo
 * history, Markdown shortcuts, tag styling, file paste/drop interception, the
 * Cmd/Ctrl+Enter save shortcut, Tab list nesting, and the Escape blur hatch.
 */
export function EditorPlugins({ onChange, onUpdate, onFiles, onSubmit, isApplyingExternal, getTags }: EditorPluginsOptions) {
  const [editor] = useLexicalComposerContext();

  // Layout phase: registrations must be live before the surface seeds its
  // initial content (child layout effects run before the parent's).
  useLayoutEffect(() => {
    const historyState = createEmptyHistoryState();
    return mergeRegister(
      registerRichText(editor),
      registerList(editor),
      registerCheckList(editor),
      registerHistory(editor, historyState, 350),
      registerMarkdownShortcuts(editor, MEMO_TRANSFORMERS),
      registerTagMentionStyling(editor),
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        const contentChanged = dirtyElements.size > 0 || dirtyLeaves.size > 0;
        if (contentChanged && !isApplyingExternal()) onChange(stateToMarkdown(editor.getEditorState()));
        onUpdate();
      }),
      // Cmd/Ctrl+Enter saves without editing the document (Enter alone still
      // breaks the line). Critical priority outranks the tag autocomplete.
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.metaKey || event?.ctrlKey) {
            event.preventDefault();
            onSubmit();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      // Escape blurs the editor so keyboard users keep an escape hatch out of
      // the otherwise Tab-trapping editor (unless the autocomplete consumed it).
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          editor.getRootElement()?.blur();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Tab nests / outdents list items; elsewhere it indents two spaces,
      // matching the decorated-source editor's keymap.
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const inListItem = editor.read(() => {
            const selection = $getSelection();
            return $isRangeSelection(selection) && $findMatchingParent(selection.anchor.getNode(), $isListItemNode) !== null;
          });
          if (inListItem) {
            event.preventDefault();
            // Already inside the command's update context — dispatch directly.
            editor.dispatchCommand(event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND);
            return true;
          }
          if (!event.shiftKey) {
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection) && selection.isCollapsed()) selection.insertText("  ");
            });
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (payload) => {
          const event = payload as ClipboardEvent;
          const files = clipboardFiles(event);
          if (files.length === 0) return false;
          event.preventDefault();
          onFiles(files);
          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length === 0) return false;
          event.preventDefault();
          placeCaretAtPoint(editor, event.clientX, event.clientY);
          onFiles(files);
          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
    );
  }, [editor, isApplyingExternal, onChange, onFiles, onSubmit]);

  return <TagAutocompletePlugin getTags={getTags} />;
}
