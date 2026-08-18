import { $applyNodeReplacement, $createTextNode, type EditorConfig, type LexicalNode, type SerializedTextNode, TextNode } from "lexical";

/**
 * Styled `@mention` span (see @/utils/mention-grammar). Same pattern as
 * TagNode: a TextNode subclass for in-place highlighting that serializes back
 * to plain source text.
 */
export class MentionNode extends TextNode {
  static getType(): string {
    return "memo-mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__text, node.__key);
  }

  static importJSON(node: SerializedTextNode): MentionNode {
    return $createMentionNode(node.text).setFormat(node.format);
  }

  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: MentionNode.getType() };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("memo-editor-mention");
    return dom;
  }

  splitText(...splitOffsets: number[]): TextNode[] {
    return super
      .splitText(...splitOffsets)
      .map((node) => (node instanceof MentionNode ? $createTextNode(node.__text).setFormat(node.getFormat()) : node));
  }
}

export function $createMentionNode(text: string): MentionNode {
  return $applyNodeReplacement(new MentionNode(text));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
