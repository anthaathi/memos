import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderEditor, tagCountsMock } from "./helpers/render-editor";

// Keep the mocked tag-counts query from the harness module fresh per suite.
describe("Editor", () => {
  it("scopes tag autocomplete stats to the current user", () => {
    renderEditor();
    expect(tagCountsMock).toHaveBeenCalledWith(true);
  });

  it("parses markdown in and serializes it back", () => {
    const h = renderEditor({ initialContent: "# Title\n\n- a\n  - b" });
    // Compact list nesting normalizes to the 4-space convention.
    expect(h.ref.current?.getMarkdown()).toBe("# Title\n\n- a\n    - b");
  });

  it("emits serialized markdown through onContentChange", () => {
    const h = renderEditor();
    h.ref.current?.setMarkdown("**hello**");
    expect(h.onChange).toHaveBeenCalledWith("**hello**");
  });

  it("does not replace newer editor text with a stale local echo", () => {
    const h = renderEditor();
    h.ref.current?.setMarkdown("H");
    h.ref.current?.setMarkdown("Hello");
    h.rerender({ initialContent: "H", contentIsExternal: false });
    expect(h.ref.current?.getMarkdown()).toBe("Hello");
  });

  it("applies external content when flagged external", () => {
    const h = renderEditor();
    h.rerender({ initialContent: "from the cache", contentIsExternal: true });
    expect(h.ref.current?.getMarkdown()).toBe("from the cache");
  });

  it("keeps native autocorrection enabled for Windows text services", () => {
    const h = renderEditor();
    expect(h.contentEditable()).toHaveAttribute("autocorrect", "on");
  });

  it("renders and updates the placeholder when its translation changes", () => {
    const h = renderEditor({ placeholder: "Any thoughts?" });
    expect(h.contentEditable()).toHaveAttribute("aria-placeholder", "Any thoughts?");
    expect(h.contentEditable()?.parentElement?.querySelector(".editor-placeholder")).toHaveTextContent("Any thoughts?");

    h.rerender({ placeholder: "有什么想法？" });
    expect(h.contentEditable()).toHaveAttribute("aria-placeholder", "有什么想法？");
    expect(h.contentEditable()?.parentElement?.querySelector(".editor-placeholder")).toHaveTextContent("有什么想法？");
  });

  it("defers external content until an IME composition ends", async () => {
    const onExternalContentApplied = vi.fn();
    const h = renderEditor({ onExternalContentApplied, contentIsExternal: true });
    const content = h.contentEditable()!;
    expect(content).not.toBeNull();

    fireEvent.compositionStart(content);
    h.rerender({ initialContent: "server value", contentIsExternal: true });
    expect(h.ref.current?.getMarkdown()).toBe("");

    // A final IME transaction can arrive after the external value entered the
    // store. The deferred external value must still win at compositionend.
    h.ref.current?.setMarkdown("local composition value");
    expect(h.onChange).toHaveBeenLastCalledWith("local composition value");
    fireEvent.compositionEnd(content);

    await waitFor(() => expect(h.ref.current?.getMarkdown()).toBe("server value"));
    expect(onExternalContentApplied).toHaveBeenLastCalledWith("server value");
    expect(h.onChange).not.toHaveBeenCalledWith("server value");
  });
});
