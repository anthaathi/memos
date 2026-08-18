import { $applyNodeReplacement, $createTextNode, type EditorConfig, type LexicalNode, type SerializedTextNode, TextNode } from "lexical";

/**
 * Styled `#tag` span (see @/utils/tag-grammar). A TextNode subclass so it flows
 * through normal text editing and serializes back to its plain source text —
 * the Markdown exporter needs no special case. The styling transform
 * (Editor/tagStyling.ts) wraps qualifying spans and demotes this node back to a
 * plain TextNode as soon as its text stops being a tag.
 */
export class TagNode extends TextNode {
  static getType(): string {
    return "memo-tag";
  }

  static clone(node: TagNode): TagNode {
    return new TagNode(node.__text, node.__key);
  }

  static importJSON(node: SerializedTextNode): TagNode {
    return $createTagNode(node.text).setFormat(node.format);
  }

  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: TagNode.getType() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("memo-editor-tag");
    return dom;
  }

  /** Editing inside a tag splits it; the pieces behave as plain text again. */
  splitText(...splitOffsets: number[]): TextNode[] {
    return super
      .splitText(...splitOffsets)
      .map((node) => (node instanceof TagNode ? $createTextNode(node.__text).setFormat(node.getFormat()) : node));
  }

  canInsertTextBefore(): boolean {
    return true;
  }
}

export function $createTagNode(text: string): TagNode {
  return $applyNodeReplacement(new TagNode(text));
}

export function $isTagNode(node: LexicalNode | null | undefined): node is TagNode {
  return node instanceof TagNode;
}
