import { $nodesOfType } from "lexical";
import { TagNode } from "@/components/MemoEditor/Editor/nodes/TagNode";
import { describe, expect, it } from "vitest";
import { createEditorHost } from "./helpers/editor-host";

/** Count rendered spans carrying the tag/mention classes. */
function styledCount(host: ReturnType<typeof createEditorHost>, className: string): number {
  return host.host.querySelectorAll(`.${className}`).length;
}

describe("tag/mention styling", () => {
  it("styles #tags and @mentions in place", () => {
    const host = createEditorHost("a #todo and #work/sub plus @alice");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(2);
      expect(styledCount(host, "memo-editor-mention")).toBe(1);
    } finally {
      host.destroy();
    }
  });

  it("does not require a left boundary", () => {
    const host = createEditorHost("hello#tag 中文#标签");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(2);
    } finally {
      host.destroy();
    }
  });

  it("keeps spans for emoji, nested, and adjacent tags", () => {
    const host = createEditorHost("#A\u200dB #👩‍💻 ##tag #first#second");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(5);
    } finally {
      host.destroy();
    }
  });

  it("does not style tags in opaque contexts (code and links)", () => {
    const host = createEditorHost("`#code` [#label](https://example.com/#link) #ok");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(1);
    } finally {
      host.destroy();
    }
  });

  it("does not style tags inside code blocks or raw Markdown blocks", () => {
    const host = createEditorHost("```\n#fence\n```\n\n| #table |\n| --- |\n| #cell |\n\n#ok");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(1);
    } finally {
      host.destroy();
    }
  });

  it("styles tags inside headings and list items", () => {
    const host = createEditorHost("## #head\n\n- [ ] #task");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(2);
    } finally {
      host.destroy();
    }
  });

  it("demotes a tag span once its text stops being a tag", () => {
    const host = createEditorHost("#todo");
    try {
      expect(styledCount(host, "memo-editor-tag")).toBe(1);
      host.editor.update(
        () => {
          for (const node of $nodesOfType(TagNode)) node.setTextContent("no tag");
        },
        { discrete: true },
      );
      expect(styledCount(host, "memo-editor-tag")).toBe(0);
      expect(host.controller.getMarkdown()).toBe("no tag");
    } finally {
      host.destroy();
    }
  });

  it("rejects invalid username shapes", () => {
    const host = createEditorHost("@-alice @alice- @álîçé");
    try {
      expect(styledCount(host, "memo-editor-mention")).toBe(0);
    } finally {
      host.destroy();
    }
  });

  it("applies mention boundaries to source text", () => {
    const host = createEditorHost("hello@alice foo-@bob (@erin) @frank@grace");
    try {
      // hello@alice and (@erin) count; foo-@bob and frank@grace do not.
      expect(styledCount(host, "memo-editor-mention")).toBe(2);
    } finally {
      host.destroy();
    }
  });
});
