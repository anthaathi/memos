import { DecoratorNode, type EditorConfig, type LexicalEditor, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import type { JSX } from "react";

/**
 * `---` / `***` / `___` horizontal rule. A block decorator rendering a plain
 * <hr>; the Markdown transformer (Editor/markdown.ts) converts between the node
 * and its source syntax.
 */
export class HorizontalRuleNode extends DecoratorNode<JSX.Element> {
  constructor(key?: NodeKey) {
    super(key);
  }

  static getType(): string {
    return "horizontal-rule";
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  static importJSON(_node: SerializedLexicalNode & Record<string, unknown>): HorizontalRuleNode {
    return $createHorizontalRuleNode();
  }

  exportJSON(): SerializedLexicalNode {
    return { type: HorizontalRuleNode.getType(), version: 1 };
  }

  getTextContent(): string {
    return "---";
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return false;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <hr className="memo-editor-hr" />;
  }
}

export interface SerializedHorizontalRuleNode extends SerializedLexicalNode {}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return new HorizontalRuleNode();
}

export function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode;
}
