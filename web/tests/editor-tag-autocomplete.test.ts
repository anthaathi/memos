import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { rankTagCandidates, tagQueryAt } from "@/components/MemoEditor/Editor/tagAutocomplete";
import { renderEditor, tagCountsMock, type EditorHarness } from "./helpers/render-editor";

describe("tag query detection", () => {
  it("finds the tag being typed at the caret", () => {
    expect(tagQueryAt("hello #to", 9)).toEqual({ from: 6, to: 9, typed: "to" });
  });

  it("returns undefined on a bare # with nothing typed", () => {
    expect(tagQueryAt("hello #", 7)).toBeUndefined();
  });

  it("returns undefined when the caret is not in a tag", () => {
    expect(tagQueryAt("hello world", 11)).toBeUndefined();
  });

  it("supports hierarchical paths mid-segment", () => {
    expect(tagQueryAt("hello#work/pr", 13)).toEqual({ from: 5, to: 13, typed: "work/pr" });
  });

  it("keeps ZWJ-joined characters in the source but not the emitted value", () => {
    expect(tagQueryAt("#A\u200dB", 4)).toEqual({ from: 0, to: 4, typed: "AB" });
  });

  it("does not treat a keycap emoji hash as an introducer", () => {
    expect(tagQueryAt("#\uFE0F\u20E3", 3)).toBeUndefined();
    expect(tagQueryAt("#\uFE0F\u20E3#ta", 6)).toEqual({ from: 3, to: 6, typed: "ta" });
  });
});

describe("tag candidate ranking", () => {
  it("offers known tags matching the typed value", () => {
    expect(rankTagCandidates("to", ["todo", "today", "work"])).toEqual(["todo", "today"]);
  });

  it("matches a segment of a nested tag path", () => {
    expect(rankTagCandidates("Mem", ["software/hosted/Memos"])).toEqual(["software/hosted/Memos"]);
  });

  it("ranks full-path prefixes above segment starts above loose substrings", () => {
    expect(rankTagCandidates("work", ["home/paperwork", "team/work-log", "work/project"])).toEqual([
      "work/project",
      "team/work-log",
      "home/paperwork",
    ]);
  });

  it("filters by the emitted value, not the raw source", () => {
    const query = tagQueryAt("#A\u200dB", 4);
    expect(rankTagCandidates(query?.typed ?? "", ["AB", "acorn"])).toEqual(["AB"]);
  });

  it("completes tags containing word-internal apostrophes", () => {
    expect(rankTagCandidates("O'Br", ["O'Brien", "O’Connor"])).toEqual(["O'Brien"]);
    expect(rankTagCandidates("O’Co", ["O'Brien", "O’Connor"])).toEqual(["O’Connor"]);
  });
});

describe("tag autocomplete menu", () => {
  const menu = () => document.querySelector(".memo-tag-autocomplete");
  const options = () => Array.from(document.querySelectorAll(".memo-tag-autocomplete-option")).map((el) => el.textContent);

  function typeTag(h: EditorHarness, text: string) {
    // Seed content and place the caret at the end of the first text node.
    h.ref.current?.setMarkdown(text);
    h.ref.current?.setCursor(text.length);
  }

  beforeEach(() => {
    tagCountsMock.mockReturnValue({ data: { todo: 1, today: 1 } as Record<string, number> });
  });

  it("offers completions while typing a tag and accepts with Enter", async () => {
    const h = renderEditor({ initialContent: "note " });
    typeTag(h, "note #to");
    await waitFor(() => expect(menu()).not.toBeNull());
    expect(options()).toEqual(["todo", "today"]);

    fireEvent.keyDown(h.contentEditable()!, { key: "Enter", bubbles: true, cancelable: true });
    await waitFor(() => expect(menu()).toBeNull());
    expect(h.ref.current?.getMarkdown()).toBe("note #todo");
  });

  it("does not offer completions in inline code", () => {
    const h = renderEditor({ initialContent: "" });
    typeTag(h, "a `#to`");
    h.ref.current?.setCursor(7); // inside the code span
    expect(menu()).toBeNull();
  });
});
