/**
 * Upload-anchor chip descriptor, shared by the editor's inline placeholder
 * node (Editor/nodes/UploadAnchorNode) and the attachment upload layer
 * (hooks/useInlineImageUpload). Editor-agnostic so the controller contract
 * (types/editorController.ts) never depends on a concrete editor.
 */
export type UploadAnchorStatus = "uploading" | "failed";

export interface UploadAnchorDescriptor {
  id: string;
  status: UploadAnchorStatus;
  completed: number;
  total: number;
  message: string;
  retryLabel: string;
  keepLabel: string;
  onRetry?: () => void;
  onKeepAttachments?: () => void;
}
