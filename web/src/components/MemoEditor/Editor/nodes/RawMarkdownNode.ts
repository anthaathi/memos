import {
  $createLineBreakNode,
  $createTextNode,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type RangeSelection,
  type SerializedElementNode,
} from "lexical";

/**
 * A block that keeps a stretch of Markdown **verbatim**. The Markdown importer
 * (Editor/markdown.ts) routes constructs the rich-text editor has no node for —
 * pipe tables, `$$` math blocks, block HTML — into this node instead of letting
 * them degrade into plain paragraphs. The user still sees and edits the source
 * (styled as raw Markdown), and the exporter emits the node's text exactly as
 * authored, so round-tripping a memo through the editor never rewrites those
 * constructs.
 */
export class RawMarkdownNode extends ElementNode {
  static getType(): string {
    return "raw-markdown";
  }

  static clone(node: RawMarkdownNode): RawMarkdownNode {
    return new RawMarkdownNode(node.__key);
  }

  static importJSON(_serializedNode: SerializedElementNode & Record<string, unknown>): RawMarkdownNode {
    return $createRawMarkdownNode();
  }

  exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: RawMarkdownNode.getType() };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const tag = document.createElement("div");
    tag.className = "memo-raw-markdown";
    tag.spellcheck = false;
    return tag;
  }

  updateDOM(): boolean {
    return false;
  }

  /**
   * Enter keeps the block whole: it inserts a line break instead of splitting
   * the source into two blocks, so a table or math fence stays one raw unit.
   */
  insertNewAfter(selection: RangeSelection | null, restoreSelection = true): null {
    selection?.insertLineBreak(restoreSelection);
    return null;
  }

  /** Verbatim source, exactly as authored (used by the Markdown exporter). */
  getMarkdown(): string {
    return this.getTextContent();
  }
}

export function $createRawMarkdownNode(): RawMarkdownNode {
  return new RawMarkdownNode();
}

/** Build a raw block whose children reproduce `markdown` byte-for-byte. */
export function $createRawMarkdownNodeWithText(markdown: string): RawMarkdownNode {
  const node = $createRawMarkdownNode();
  const lines = markdown.split("\n");
  for (const [index, line] of lines.entries()) {
    if (index > 0) node.append($createLineBreakNode());
    if (line.length > 0) node.append($createTextNode(line));
  }
  return node;
}

export function $isRawMarkdownNode(node: LexicalNode | null | undefined): node is RawMarkdownNode {
  return node instanceof RawMarkdownNode;
}
