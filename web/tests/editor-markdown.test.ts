import { describe, expect, it } from "vitest";
import { normalizeListIndentation, segmentMarkdown } from "@/components/MemoEditor/Editor/markdown";
import { createEditorHost } from "./helpers/editor-host";

describe("markdown segmentation", () => {
  it("keeps pipe tables as raw segments", () => {
    expect(segmentMarkdown("before\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter")).toEqual([
      { text: "before", raw: false },
      { text: "| a | b |\n| --- | --- |\n| 1 | 2 |", raw: true },
      { text: "after", raw: false },
    ]);
  });

  it("keeps $$ math blocks raw, including unterminated ones", () => {
    expect(segmentMarkdown("$$\nE = mc^2\n$$")).toEqual([{ text: "$$\nE = mc^2\n$$", raw: true }]);
    expect(segmentMarkdown("$$x^2$$ + 1")).toEqual([{ text: "$$x^2$$ + 1", raw: false }]);
    expect(segmentMarkdown("text\n$$\nnever closed")).toEqual([
      { text: "text", raw: false },
      { text: "$$\nnever closed", raw: true },
    ]);
  });

  it("keeps block HTML raw through its blank-line end", () => {
    expect(segmentMarkdown('<div data-x="1">\n  <span>hi</span>\n</div>\n\npara')).toEqual([
      { text: '<div data-x="1">\n  <span>hi</span>\n</div>', raw: true },
      { text: "para", raw: false },
    ]);
  });

  it("leaves fenced code in the rich segment", () => {
    const segments = segmentMarkdown("```\n| not | a | table |\n```");
    expect(segments).toEqual([{ text: "```\n| not | a | table |\n```", raw: false }]);
  });
});

describe("list indentation normalization", () => {
  it("expands compact bullet nesting to 4-space levels", () => {
    expect(normalizeListIndentation("- a\n  - b")).toBe("- a\n    - b");
  });

  it("expands compact ordered nesting and keeps siblings", () => {
    expect(normalizeListIndentation("1. a\n   1. b\n2. c")).toBe("1. a\n    1. b\n2. c");
  });

  it("nests beneath task items at the checkbox content column", () => {
    expect(normalizeListIndentation("- [ ] a\n      - b")).toBe("- [ ] a\n    - b");
  });

  it("does not touch fenced code", () => {
    expect(normalizeListIndentation("```\n  - not a list\n```")).toBe("```\n  - not a list\n```");
  });
});

describe("markdown round-trip", () => {
  const roundTrip = (markdown: string): string => {
    const host = createEditorHost();
    try {
      host.controller.setMarkdown(markdown);
      return host.controller.getMarkdown();
    } finally {
      host.destroy();
    }
  };

  it("preserves core blocks and inline marks", () => {
    const markdown = [
      "# Title",
      "",
      "Some **bold**, *italic*, ~~struck~~, `code`, and a [link](https://example.com/page).",
      "",
      "> quoted wisdom",
      "",
      "---",
      "",
      "```ts",
      "const a = 1;",
      "```",
    ].join("\n");
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps single newlines as breaks and blank lines as paragraphs", () => {
    expect(roundTrip("line1\nline2")).toBe("line1\nline2");
    expect(roundTrip("para1\n\npara2")).toBe("para1\n\npara2");
  });

  it("preserves hard-break trailing spaces byte-for-byte", () => {
    expect(roundTrip("line1  \nline2")).toBe("line1  \nline2");
  });

  it("normalizes compact list nesting to indented nesting", () => {
    expect(roundTrip("- a\n  - b")).toBe("- a\n    - b");
    expect(roundTrip("1. a\n   1. b")).toBe("1. a\n    1. b");
  });

  it("round-trips task lists as check lists", () => {
    expect(roundTrip("- [ ] a\n- [x] b")).toBe("- [ ] a\n- [x] b");
  });

  it("preserves images with alt text and titles", () => {
    expect(roundTrip("![alt text](/file/attachments/photo \"the title\")")).toBe('![alt text](/file/attachments/photo "the title")');
  });

  it("preserves tables, math blocks, and block HTML verbatim", () => {
    const table = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const math = "$$\nE = mc^2\n$$";
    const html = '<div class="note">\n  <span>x</span>\n</div>';
    expect(roundTrip(table)).toBe(table);
    expect(roundTrip(math)).toBe(math);
    expect(roundTrip(html)).toBe(html);
  });

  it("keeps #tags and @mentions as plain source text", () => {
    expect(roundTrip("note #todo/next and @alice here")).toBe("note #todo/next and @alice here");
  });

  it("escapes literal emphasis characters without drift", () => {
    expect(roundTrip("a * b")).toBe("a \\* b");
    expect(roundTrip("a \\* b")).toBe("a \\* b");
    // A literal backslash serializes escaped and re-imports to itself.
    expect(roundTrip("C:\\path")).toBe("C:\\\\path");
    expect(roundTrip("C:\\\\path")).toBe("C:\\\\path");
  });

  it("is idempotent: a second round-trip changes nothing", () => {
    const first = [
      "# Heading",
      "",
      "- [ ] task #tag",
      "  - nested item",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "![pic](/file/x.png)",
    ].join("\n");
    const once = roundTrip(first);
    expect(roundTrip(once)).toBe(once);
  });

  it("preserves setext headings textually (they re-parse as headings)", () => {
    expect(roundTrip("Title\n===")).toBe("Title\n===");
  });
});
