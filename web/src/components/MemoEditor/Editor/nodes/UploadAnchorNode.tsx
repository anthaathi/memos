import { DecoratorNode, type EditorConfig, type LexicalEditor, type LexicalNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import type { JSX } from "react";
import type { UploadAnchorDescriptor, UploadAnchorStatus } from "../../types/uploadAnchor";

/**
 * Block-level placeholder chip shown while inline images upload: a progress
 * rail with message, and on failure Retry / Keep-as-attachments actions.
 * Never serializes to Markdown — the upload layer resolves it to image
 * Markdown (or cancels it).
 */
export class UploadAnchorNode extends DecoratorNode<JSX.Element> {
  __id: string;
  __descriptor: UploadAnchorDescriptor;

  constructor(id: string, descriptor: UploadAnchorDescriptor, key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__descriptor = descriptor;
  }

  static getType(): string {
    return "upload-anchor";
  }

  static clone(node: UploadAnchorNode): UploadAnchorNode {
    return new UploadAnchorNode(node.__id, node.__descriptor, node.__key);
  }

  static importJSON(_node: SerializedLexicalNode & Record<string, unknown>): UploadAnchorNode {
    // Upload anchors are transient; cloning via clipboard should not carry them.
    return new UploadAnchorNode("invalid", {
      id: "invalid",
      status: "failed",
      completed: 0,
      total: 0,
      message: "",
      retryLabel: "",
      keepLabel: "",
    });
  }

  exportJSON(): SerializedLexicalNode {
    return { type: UploadAnchorNode.getType(), version: 1 };
  }

  getId(): string {
    return this.__id;
  }

  getDescriptor(): UploadAnchorDescriptor {
    return this.__descriptor;
  }

  setDescriptor(descriptor: UploadAnchorDescriptor): void {
    const self = this.getWritable();
    self.__descriptor = descriptor;
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
    return <UploadAnchorChip descriptor={this.__descriptor} />;
  }
}

export interface SerializedUploadAnchorNode extends SerializedLexicalNode {
  id: string;
}

function UploadAnchorChip({ descriptor }: { descriptor: UploadAnchorDescriptor }): JSX.Element {
  const status: UploadAnchorStatus = descriptor.status;
  return (
    <div className="memo-upload-anchor" data-status={status} role="status" aria-live="polite">
      <span className="memo-upload-anchor-rail" aria-hidden="true" />
      <span className="memo-upload-anchor-badge">
        {status === "uploading" && <span className="memo-upload-anchor-spinner" aria-hidden="true" />}
        {descriptor.message}
      </span>
      {status === "failed" && (
        <span className="memo-upload-anchor-actions">
          {descriptor.onRetry && (
            <button type="button" className="memo-upload-anchor-action" onClick={descriptor.onRetry}>
              {descriptor.retryLabel}
            </button>
          )}
          {descriptor.onKeepAttachments && (
            <button type="button" className="memo-upload-anchor-action" onClick={descriptor.onKeepAttachments}>
              {descriptor.keepLabel}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export function $createUploadAnchorNode(descriptor: UploadAnchorDescriptor): UploadAnchorNode {
  return new UploadAnchorNode(descriptor.id, descriptor);
}

export function $isUploadAnchorNode(node: LexicalNode | null | undefined): node is UploadAnchorNode {
  return node instanceof UploadAnchorNode;
}
