import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $createLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createHeadingNode, $isHeadingNode, $isQuoteNode, type HeadingNode, type HeadingTagType } from "@lexical/rich-text";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $findMatchingParent,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  type ElementNode,
  FORMAT_TEXT_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
  type TextNode,
} from "lexical";
import {
  type ActiveFormatState,
  type EditorCommandContext,
  type EditorCommandId,
  EMPTY_ACTIVE_FORMATS,
  toToolbarHeadingLevel,
} from "../formatting/commands";
import type { FormattingController } from "../types/editorController";

/**
 * FormattingController over Lexical: the catalog verbs (formatting/commands.ts)
 * map onto Lexical commands and node conversions, and active state is read from
 * the selection's ancestors and text formats.
 */

/**
 * Dispatch a command inside a synchronous update so the handler observes the
 * committed selection (dispatching outside an update can lose the selection
 * context, e.g. when the DOM selection cannot represent it).
 */
function dispatchSync<P>(editor: LexicalEditor, command: LexicalCommand<P>, payload?: P): void {
  editor.update(
    () => {
      if (payload === undefined) (editor.dispatchCommand as (command: LexicalCommand<P>) => boolean)(command);
      else editor.dispatchCommand(command, payload);
    },
    { discrete: true },
  );
}

type MarkCommand = "bold" | "italic" | "strikethrough" | "code";
const MARK_COMMANDS: Record<MarkCommand, MarkCommand> = { bold: "bold", italic: "italic", strikethrough: "strikethrough", code: "code" };
type ListCommand = "bulletList" | "orderedList" | "taskList";
const isMarkCommand = (command: EditorCommandId): command is MarkCommand => command in MARK_COMMANDS;
const isListCommand = (command: EditorCommandId): command is ListCommand =>
  command === "bulletList" || command === "orderedList" || command === "taskList";

/** Append one text node per source line, joined by explicit line breaks. */
function appendLines(target: ElementNode, text: string): void {
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (index > 0) target.append($createLineBreakNode());
    if (line.length > 0) target.append($createTextNode(line));
  }
}

/** The top-level blocks touched by the selection. */
function $selectedBlocks(): ElementNode[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  const anchor = selection.anchor.getNode();
  const root = $findMatchingParent(anchor, (parent) => parent.getKey() === "root");
  const blocks =
    root && "getChildren" in root
      ? ((root as ElementNode).getChildren().filter((child) => child.isSelected(selection) && $isElementNode(child)) as ElementNode[])
      : [];
  if (blocks.length > 0) return blocks;
  const block = $findMatchingParent(anchor, (parent) => parent.getParent()?.getKey() === "root");
  return block && $isElementNode(block) ? [block] : [];
}

/** Convert text blocks (paragraph/heading/quote) to the given heading level. */
function setHeadingLevel(editor: LexicalEditor, tag: HeadingTagType | null): void {
  editor.update(
    () => {
      const blocks = $selectedBlocks();
      let last: ElementNode | null = null;
      for (const block of blocks) {
        if (!$isParagraphNode(block) && !$isHeadingNode(block) && !$isQuoteNode(block)) continue;
        if (tag === null && $isParagraphNode(block)) continue;
        const replacement = tag === null ? $createParagraphNode() : $createHeadingNode(tag);
        replacement.append(...block.getChildren());
        block.replace(replacement);
        last = replacement;
      }
      last?.selectEnd();
    },
    { discrete: true },
  );
}

/** Toggle a fenced code block around the selected top-level blocks. */
function toggleCodeBlock(editor: LexicalEditor): void {
  editor.update(
    () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchor = selection.anchor.getNode();
      const existing = $findMatchingParent(anchor, $isCodeNode);
      if (existing) {
        const paragraph = $createParagraphNode();
        appendLines(paragraph, existing.getTextContent());
        existing.replace(paragraph);
        paragraph.select(0, 0);
        return;
      }
      const targets = $selectedBlocks();
      if (targets.length === 0) return;
      const code = $createCodeNode();
      appendLines(code, targets.map((block) => block.getTextContent()).join("\n"));
      targets[0]!.insertBefore(code);
      for (const block of targets) block.remove();
      code.selectEnd();
    },
    { discrete: true },
  );
}

/** Unwrap the link at the caret, or link the selection to `url`. */
function toggleLink(editor: LexicalEditor, ctx?: EditorCommandContext): void {
  const url = ctx?.url?.trim();
  const insideLink = editor.read(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) && $findMatchingParent(selection.anchor.getNode(), $isLinkNode) !== null;
  });
  if (insideLink) {
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
        if (!link) return;
        const children = link.getChildren();
        for (const child of children) link.insertBefore(child);
        link.remove();
      },
      { discrete: true },
    );
    return;
  }
  if (!url) return;
  const collapsed = editor.read(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) && selection.isCollapsed();
  });
  if (collapsed) {
    // Empty selection: the URL doubles as the label.
    editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const link = $createLinkNode(url);
        link.append($createTextNode(url));
        selection.insertNodes([link]);
        link.select(0, url.length);
      },
      { discrete: true },
    );
    return;
  }
  dispatchSync(editor, TOGGLE_LINK_COMMAND, url);
}

/** The top-level block holding the selection anchor. */
function anchorBlockOf(selection: ReturnType<typeof $getSelection>): ElementNode | HeadingNode | null {
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const block = $findMatchingParent(anchor, (parent) => parent.getParent()?.getKey() === "root");
  return block && $isElementNode(block) ? block : null;
}

export function createFormattingController(editor: LexicalEditor, listeners: Set<() => void>): FormattingController {
  const getActiveFormats = (): ActiveFormatState =>
    editor.read(() => {
      const active: ActiveFormatState = { ...EMPTY_ACTIVE_FORMATS };
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return active;
      // Marks come from the touched text nodes (a programmatically placed
      // collapsed caret does not sync RangeSelection.format).
      const anchor: LexicalNode = selection.anchor.getNode();
      const markedNodes: TextNode[] = selection.isCollapsed() && $isTextNode(anchor) ? [anchor] : selection.getNodes().filter($isTextNode);
      const everyNode = (format: TextFormatType) => markedNodes.length > 0 && markedNodes.every((node) => node.hasFormat(format));
      active.bold = everyNode("bold");
      active.italic = everyNode("italic");
      active.strikethrough = everyNode("strikethrough");
      active.code = everyNode("code");
      const block = anchorBlockOf(selection);
      if (block) {
        if ($isCodeNode(block)) active.codeBlock = true;
        if ($isHeadingNode(block)) active.headingLevel = toToolbarHeadingLevel(Number(block.getTag().slice(1)));
      }
      const list = $findMatchingParent(anchor, $isListNode);
      if (list) {
        const listType = list.getListType();
        if (listType === "number") active.orderedList = true;
        else if (listType === "check") active.taskList = true;
        else active.bulletList = true;
      }
      active.link = $findMatchingParent(anchor, $isLinkNode) !== null || selection.getNodes().some((node) => $isLinkNode(node));
      return active;
    });

  return {
    run(command: EditorCommandId, ctx?: EditorCommandContext) {
      if (isMarkCommand(command)) {
        // A collapsed caret inside formatted text toggles that span (matching
        // the decorated-source editor, where Bold at the caret unwrapped it);
        // Lexical's command alone would only style future typing.
        editor.update(
          () => {
            const selection = $getSelection();
            const anchor =
              selection !== null && $isRangeSelection(selection) && selection.isCollapsed() ? selection.anchor.getNode() : null;
            if ($isTextNode(anchor)) anchor.toggleFormat(MARK_COMMANDS[command]);
            else editor.dispatchCommand(FORMAT_TEXT_COMMAND, MARK_COMMANDS[command]);
          },
          { discrete: true },
        );
        return;
      }
      if (isListCommand(command)) {
        // Re-running a list command would convert the item's list type; when
        // that list is already active, toggle it off instead.
        const active = getActiveFormats();
        if (command === "bulletList" ? active.bulletList : command === "orderedList" ? active.orderedList : active.taskList) {
          dispatchSync(editor, REMOVE_LIST_COMMAND);
        } else if (command === "bulletList") {
          dispatchSync(editor, INSERT_UNORDERED_LIST_COMMAND);
        } else if (command === "orderedList") {
          dispatchSync(editor, INSERT_ORDERED_LIST_COMMAND);
        } else {
          dispatchSync(editor, INSERT_CHECK_LIST_COMMAND);
        }
        return;
      }
      switch (command) {
        case "codeBlock":
          toggleCodeBlock(editor);
          break;
        case "paragraph":
          setHeadingLevel(editor, null);
          break;
        case "heading1":
          setHeadingLevel(editor, "h1");
          break;
        case "heading2":
          setHeadingLevel(editor, "h2");
          break;
        case "heading3":
          setHeadingLevel(editor, "h3");
          break;
        case "link":
          toggleLink(editor, ctx);
          break;
      }
    },
    getActiveFormats,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
