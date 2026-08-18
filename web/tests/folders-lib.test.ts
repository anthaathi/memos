import { describe, expect, it } from "vitest";
import { buildFolderName, getFolderUID, getFolderPath, getUngroupedFolderPath, UNGROUPED_FOLDER_ID } from "@/lib/folders";

describe("folder helpers", () => {
  it("builds and parses folder resource names", () => {
    const name = buildFolderName("users/alice", "abc-123");
    expect(name).toBe("users/alice/folders/abc-123");
    expect(getFolderUID(name)).toBe("abc-123");
  });

  it("maps folder IDs to page paths", () => {
    expect(getFolderPath("abc")).toBe("/folders/abc");
    expect(getFolderPath(UNGROUPED_FOLDER_ID)).toBe("/folders/ungrouped");
    expect(getUngroupedFolderPath()).toBe("/folders/ungrouped");
  });

  it("reserves the ungrouped route segment", () => {
    expect(UNGROUPED_FOLDER_ID).toBe("ungrouped");
  });
});
