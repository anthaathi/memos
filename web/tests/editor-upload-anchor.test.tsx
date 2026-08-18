import { $getRoot, $isTextNode } from "lexical";
import { describe, expect, it, vi } from "vitest";
import type { UploadAnchorDescriptor } from "@/components/MemoEditor/types/uploadAnchor";
import { createEditorHost } from "./helpers/editor-host";
import { renderEditor } from "./helpers/render-editor";

const descriptor = (id: string): UploadAnchorDescriptor => ({
  id,
  status: "uploading",
  completed: 0,
  total: 1,
  message: "Uploading images 0/1",
  retryLabel: "Retry",
  keepLabel: "Keep as attachments",
  onRetry: vi.fn(),
  onKeepAttachments: vi.fn(),
});

describe("editor upload anchors", () => {
  it("keeps the anchor through edits and resolves it to Markdown", () => {
    const host = createEditorHost("alpha");
    try {
      host.controller.setCursor(5);
      host.controller.createUploadAnchor(descriptor("upload-one"));

      // An edit elsewhere in the document must not lose the anchor.
      host.editor.update(
        () => {
          const text = $getRoot().getFirstDescendant();
          if ($isTextNode(text)) text.setTextContent(`X${text.getTextContent()}`);
        },
        { discrete: true },
      );

      host.controller.resolveUploadAnchor("upload-one", "![photo](/file/attachments/photo)");
      expect(host.controller.getMarkdown()).toBe("Xalpha\n\n![photo](/file/attachments/photo)");
    } finally {
      host.destroy();
    }
  });

  it("cancels an anchor without changing serialized Markdown", () => {
    const host = createEditorHost("alpha");
    try {
      host.controller.createUploadAnchor(descriptor("upload-two"));
      host.controller.cancelUploadAnchor("upload-two");
      expect(host.controller.getMarkdown().trim()).toBe("alpha");
    } finally {
      host.destroy();
    }
  });

  it("treats an empty resolution as a cancel", () => {
    const host = createEditorHost("alpha");
    try {
      host.controller.createUploadAnchor(descriptor("upload-empty"));
      host.controller.resolveUploadAnchor("upload-empty", "");
      expect(host.controller.getMarkdown().trim()).toBe("alpha");
    } finally {
      host.destroy();
    }
  });

  it("never serializes the chip into Markdown, and a chip-only document is empty", () => {
    const host = createEditorHost("alpha");
    try {
      host.controller.createUploadAnchor(descriptor("upload-four"));
      expect(host.controller.getMarkdown().trim()).toBe("alpha");
      const onlyChip = createEditorHost();
      try {
        onlyChip.controller.createUploadAnchor(descriptor("upload-five"));
        expect(onlyChip.controller.isEmpty()).toBe(true);
      } finally {
        onlyChip.destroy();
      }
    } finally {
      host.destroy();
    }
  });
});

describe("upload anchor chip (component)", () => {
  it("renders the chip, updates it in place, and resolves it away", () => {
    const h = renderEditor({ initialContent: "alpha" });
    h.ref.current?.createUploadAnchor(descriptor("upload-one"));
    expect(document.querySelector(".memo-upload-anchor")).not.toBeNull();
    expect(document.querySelector(".memo-upload-anchor-badge")?.textContent).toContain("Uploading images 0/1");

    const stale = vi.fn();
    h.ref.current?.updateUploadAnchor({ ...descriptor("upload-one"), status: "failed", message: "Retrying soon", onRetry: stale });
    expect(document.querySelector(".memo-upload-anchor-badge")?.textContent).toBe("Retrying soon");

    // Only the fresh callbacks stay wired to the buttons.
    const fresh = vi.fn();
    h.ref.current?.updateUploadAnchor({ ...descriptor("upload-one"), status: "failed", message: "Retrying soon", onRetry: fresh });
    document.querySelector<HTMLButtonElement>(".memo-upload-anchor-action")?.click();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();

    h.ref.current?.resolveUploadAnchor("upload-one", "![photo](/file/attachments/photo)");
    expect(document.querySelector(".memo-upload-anchor")).toBeNull();
    expect(h.ref.current?.getMarkdown()).toBe("alpha\n\n![photo](/file/attachments/photo)");
  });
});
