import { describe, expect, it } from "vitest";
import { buildMemoFilter } from "@/hooks/useMemoFilters";

describe("buildMemoFilter folder scoping", () => {
  it("scopes to a folder UID", () => {
    expect(buildMemoFilter({ filters: [], includePinned: false, folderUID: "abc-123" })).toBe(`folder_uid == "abc-123"`);
  });

  it("scopes to ungrouped memos", () => {
    expect(buildMemoFilter({ filters: [], includePinned: false, ungroupedOnly: true })).toBe(`folder_uid == ""`);
  });

  it("combines folder scoping with creator and other filters", () => {
    const filter = buildMemoFilter({
      creatorName: "users/1",
      filters: [{ factor: "tagSearch", value: "work" }],
      includePinned: false,
      folderUID: "abc",
    });
    expect(filter).toBe(`creator == "users/1" && tag in ["work"] && folder_uid == "abc"`);
  });

  it("prefers folderUID over ungroupedOnly when both are set", () => {
    expect(buildMemoFilter({ filters: [], includePinned: false, folderUID: "abc", ungroupedOnly: true })).toBe(`folder_uid == "abc"`);
  });

  it("returns undefined without folder options", () => {
    expect(buildMemoFilter({ filters: [], includePinned: false })).toBeUndefined();
  });

  it("escapes quotes in folder UIDs", () => {
    expect(buildMemoFilter({ filters: [], includePinned: false, folderUID: `a"b` })).toBe(`folder_uid == "a\\"b"`);
  });
});
