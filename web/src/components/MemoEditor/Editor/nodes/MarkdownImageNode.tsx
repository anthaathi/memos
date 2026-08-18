import { DecoratorNode, type EditorConfig, type LexicalEditor, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import type { JSX } from "react";

export interface MarkdownImagePayload {
  alt: string;
  src: string;
  title?: string;
}

function serializeTitle(title?: string): string {
  return title ? ` "${title.replace(/(["\\])/g, "\\$1")}"` : "";
}

/**
 * Inline image for `![alt](src)` Markdown. A decorator so the picture renders
 * in place while editing; the Markdown transformer (Editor/markdown.ts)
 * converts it back to its source syntax on export.
 */
export class MarkdownImageNode extends DecoratorNode<JSX.Element> {
  __alt: string;
  __src: string;
  __title: string | undefined;

  constructor(payload: MarkdownImagePayload, key?: NodeKey) {
    super(key);
    this.__alt = payload.alt;
    this.__src = payload.src;
    this.__title = payload.title;
  }

  static getType(): string {
    return "markdown-image";
  }

  static clone(node: MarkdownImageNode): MarkdownImageNode {
    return new MarkdownImageNode({ alt: node.__alt, src: node.__src, title: node.__title }, node.__key);
  }

  static importJSON(node: SerializedLexicalNode & Record<string, unknown>): MarkdownImageNode {
    const payload = node as unknown as SerializedMarkdownImageNode;
    return $createMarkdownImageNode({ alt: payload.alt, src: payload.src, title: payload.title });
  }

  exportJSON(): SerializedMarkdownImageNode {
    return { ...super.exportJSON(), alt: this.__alt, src: this.__src, title: this.__title };
  }

  getAlt(): string {
    return this.__alt;
  }

  getSrc(): string {
    return this.__src;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  setAlt(alt: string): void {
    const self = this.getWritable();
    self.__alt = alt;
  }

  setSrc(src: string): void {
    const self = this.getWritable();
    self.__src = src;
  }

  /** Source syntax for serialization and plain-text projections. */
  toMarkdown(): string {
    const alt = this.__alt.replace(/([[\\])/g, "\\$1");
    return `![${alt}](${this.__src}${serializeTitle(this.__title)})`;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <MarkdownImageElement node={this} />;
  }

  getTextContent(): string {
    return this.toMarkdown();
  }
}

function MarkdownImageElement({ node }: { node: MarkdownImageNode }): JSX.Element {
  return (
    <img
      alt={node.getAlt()}
      src={node.getSrc()}
      title={node.getTitle()}
      className="memo-editor-image"
      draggable={false}
      // Selection lives in the editor's contentEditable; keep pointer events
      // from swallowing caret placement around the image.
      onMouseDown={(event) => event.preventDefault()}
    />
  );
}

export interface SerializedMarkdownImageNode extends SerializedLexicalNode {
  alt: string;
  src: string;
  title?: string;
}

export function $createMarkdownImageNode(payload: MarkdownImagePayload): MarkdownImageNode {
  return new MarkdownImageNode(payload);
}

export function $isMarkdownImageNode(node: LexicalNode | null | undefined): node is MarkdownImageNode {
  return node instanceof MarkdownImageNode;
}
