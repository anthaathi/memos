import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $selectAll,
  $setSelection,
  $splitNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type PointType,
  type TextNode,
} from "lexical";
import type { EditorController, FormattingController } from "../types/editorController";
import type { UploadAnchorDescriptor } from "../types/uploadAnchor";
import { markdownToNodes, stateToMarkdown } from "./markdown";
import { $createUploadAnchorNode, $isUploadAnchorNode, UploadAnchorNode } from "./nodes/UploadAnchorNode";

/**
 * EditorController over a Lexical editor. Markdown remains the only storage
 * format: setMarkdown parses it into the editor and getMarkdown serializes the
 * tree back out (cached per editor state).
 */

function $descendants(node: LexicalNode): LexicalNode[] {
  if (!("getChildren" in node)) return [];
  const children = (node as ElementNode).getChildren();
  return [...children, ...children.flatMap($descendants)];
}

function $uploadAnchorById(id: string): UploadAnchorNode | null {
  return $descendants($getRoot()).find((node) => $isUploadAnchorNode(node) && node.getId() === id) as UploadAnchorNode | null;
}

/** Replace a node with one or more nodes (Lexical's replace() is single-node). */
function $replaceWithNodes(node: LexicalNode, nodes: LexicalNode[]): void {
  if (nodes.length === 0) {
    node.remove();
    return;
  }
  node.replace(nodes[0]!);
  let cursor = nodes[0]!;
  for (let index = 1; index < nodes.length; index++) {
    cursor.insertAfter(nodes[index]!);
    cursor = nodes[index]!;
  }
}

/** Top-level block containing the selection anchor (for block-level inserts). */
function $anchorTopLevelBlock(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node && node.getParent()?.getKey() !== "root") node = node.getParent();
  return node && "getChildren" in node ? (node as ElementNode) : null;
}

/** The caret as an offset into the document's plain-text projection. */
interface ProjectionCursor {
  block: number;
  node: TextNode | null;
  offset: number;
}

function $topLevelBlocks(): ElementNode[] {
  return $getRoot()
    .getChildren()
    .filter((child): child is ElementNode => "getChildren" in child);
}

/** Blocks joined by newlines — the cursor coordinate space (see getCursor). */
function $projectionParts(): { text: string; cursors: ProjectionCursor[] } {
  const cursors: ProjectionCursor[] = [];
  let text = "";
  const blocks = $topLevelBlocks();
  for (const [blockIndex, block] of blocks.entries()) {
    if (blockIndex > 0) {
      cursors.push({ block: blockIndex, node: null, offset: text.length });
      text += "\n";
    }
    const textNodes = block.getAllTextNodes();
    if (textNodes.length === 0) {
      cursors.push({ block: blockIndex, node: null, offset: text.length });
      continue;
    }
    for (const node of textNodes) {
      cursors.push({ block: blockIndex, node, offset: text.length });
      text += node.getTextContent();
    }
    cursors.push({ block: blockIndex, node: null, offset: text.length });
  }
  return { text, cursors };
}

function $anchorPoint(): PointType | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return selection.anchor;
}

/** The selection's focus end — where block inserts land (CM's `head`). */
function $focusPoint(): PointType | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return selection.focus;
}

export function createController(editor: LexicalEditor, formatting: FormattingController): EditorController {
  return {
    focus: () => editor.focus(),
    hasFocus: () => {
      const root = editor.getRootElement();
      return root !== null && document.activeElement !== null && root.contains(document.activeElement);
    },
    isEmpty: () =>
      editor.read(() => {
        // Upload chips are transient placeholders, never memo content.
        return $getRoot()
          .getChildren()
          .filter((child) => !$isUploadAnchorNode(child))
          .every((child) => child.getTextContent().trim() === "");
      }),
    getMarkdown: () => stateToMarkdown(editor.getEditorState()),
    setMarkdown: (markdown) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append(...markdownToNodes(markdown));
          root.selectEnd();
        },
        { discrete: true, tag: "history-merge" },
      );
    },
    insertMarkdown: (markdown) => {
      if (!markdown) return;
      editor.update(
        () => {
          const nodes = markdownToNodes(markdown);
          const point = $focusPoint();
          const block = $anchorTopLevelBlock();
          if (!point || !block) {
            $getRoot().append(...nodes);
            $getRoot().selectEnd();
            return;
          }
          // Insert at the caret without consuming the selection: callers live
          // outside the editor and a highlighted range must not be deleted.
          // The insert splits the caret's block, so the new Markdown lands as
          // its own block between the halves (insertNodes on a live selection
          // leaves it dangling across the split).
          const node = point.getNode();
          let childIndex: number;
          if ($isTextNode(node)) {
            const offset = Math.max(0, Math.min(point.offset, node.getTextContentSize()));
            const parts = offset > 0 ? node.splitText(offset) : [];
            childIndex = block.getChildren().findIndex((child) => child === (parts[1] ?? node));
          } else if (node === block) {
            childIndex = point.offset;
          } else {
            childIndex = block.getChildren().findIndex((child) => child === node);
          }
          const insertBefore = (target: ElementNode) => {
            for (const inserted of nodes) target.insertBefore(inserted);
          };
          if (childIndex <= 0) {
            insertBefore(block);
          } else if (childIndex >= block.getChildrenSize()) {
            let cursor: ElementNode = block;
            for (const inserted of nodes) {
              cursor.insertAfter(inserted);
              cursor = inserted as ElementNode;
            }
          } else {
            const [, right] = $splitNode(block, childIndex);
            insertBefore(right);
          }
          const last = nodes[nodes.length - 1];
          if ($isElementNode(last)) last.selectEnd();
          else $getRoot().selectEnd();
        },
        { discrete: true },
      );
      editor.focus();
    },
    createUploadAnchor: (descriptor: UploadAnchorDescriptor, _position?: number) => {
      editor.update(
        () => {
          const anchor = $createUploadAnchorNode(descriptor);
          const block = $anchorTopLevelBlock();
          if (block) block.insertAfter(anchor);
          else $getRoot().append(anchor);
        },
        { discrete: true },
      );
    },
    updateUploadAnchor: (descriptor: UploadAnchorDescriptor) => {
      editor.update(
        () => {
          const node = $uploadAnchorById(descriptor.id);
          node?.setDescriptor(descriptor);
        },
        { discrete: true },
      );
    },
    resolveUploadAnchor: (id: string, markdown: string) => {
      editor.update(
        () => {
          const node = $uploadAnchorById(id);
          if (!node) return;
          if (!markdown) {
            node.remove();
            return;
          }
          const nodes = markdownToNodes(markdown);
          $replaceWithNodes(node, nodes);
          const last = nodes[nodes.length - 1];
          if (last && "selectEnd" in last) (last as ElementNode).selectEnd();
        },
        { discrete: true },
      );
      editor.focus();
    },
    cancelUploadAnchor: (id: string) => {
      editor.update(
        () => {
          $uploadAnchorById(id)?.remove();
        },
        { discrete: true },
      );
    },
    getCursor: () =>
      editor.read(() => {
        const point = $anchorPoint();
        if (!point) return 0;
        const { text, cursors } = $projectionParts();
        const node = point.getNode();
        if ($isTextNode(node)) {
          const cursor = cursors.find((candidate) => candidate.node === node);
          if (cursor) return Math.min(cursor.offset + point.offset, text.length);
        }
        // Caret on a block boundary: land on that block's start offset.
        const blocks = $topLevelBlocks();
        let blockIndex = 0;
        if (!("getChildren" in node)) {
          let walker: LexicalNode | null = node;
          while (walker && walker.getParent()?.getKey() !== "root") walker = walker.getParent();
          blockIndex = Math.max(
            0,
            blocks.findIndex((block) => block === walker),
          );
        } else {
          blockIndex = Math.max(
            0,
            blocks.findIndex((block) => block === node),
          );
        }
        const boundary = cursors.find((candidate) => candidate.block === blockIndex && candidate.node === null);
        return boundary ? Math.min(boundary.offset, text.length) : 0;
      }),
    setCursor: (position: number) => {
      editor.update(
        () => {
          const { text, cursors } = $projectionParts();
          const target = Math.min(Math.max(position, 0), text.length);
          const range = $createRangeSelection();
          // Prefer landing inside a text node: its cursor carries the start
          // offset of the node's text, so the caret splits it at `target`.
          let placed = false;
          for (const candidate of cursors) {
            if (!candidate.node) continue;
            const size = candidate.node.getTextContentSize();
            if (target >= candidate.offset && target <= candidate.offset + size) {
              const offset = target - candidate.offset;
              if (offset === size && candidate.node.getNextSibling() === null) {
                // Caret after the last text node of a block is expressed as an
                // element point so selection normalization keeps it there.
                const parent = candidate.node.getParent();
                if (parent) {
                  range.anchor.set(parent.getKey(), parent.getChildrenSize(), "element");
                  range.focus.set(parent.getKey(), parent.getChildrenSize(), "element");
                  placed = true;
                  break;
                }
              }
              range.anchor.set(candidate.node.getKey(), offset, "text");
              range.focus.set(candidate.node.getKey(), offset, "text");
              placed = true;
              break;
            }
          }
          if (!placed) {
            // Empty blocks (or offsets past the end): snap to the closest block
            // boundary at or before the offset.
            const boundary = cursors
              .filter((candidate) => candidate.node === null)
              .reduce<ProjectionCursor | undefined>(
                (best, candidate) => (!best || (candidate.offset <= target && candidate.offset > best.offset) ? candidate : best),
                undefined,
              );
            const block = boundary ? $topLevelBlocks()[boundary.block] : undefined;
            if (block) {
              range.anchor.set(block.getKey(), 0, "element");
              range.focus.set(block.getKey(), 0, "element");
            }
          }
          $setSelection(range);
        },
        { discrete: true },
      );
    },
    scrollToCursor: () => {
      const selection = window.getSelection();
      const element = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).startContainer : null;
      const parent = element instanceof HTMLElement ? element : element?.parentElement;
      parent?.scrollIntoView({ block: "nearest" });
    },
    selectAll: () => {
      editor.update(
        () => {
          $selectAll();
        },
        { discrete: true },
      );
    },
    formatting,
  };
}
