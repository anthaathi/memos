import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FolderView from "@/pages/FolderView";
import type { Folder } from "@/types/proto/api/v1/folder_service_pb";

const folderState = vi.hoisted(() => ({
  folders: [] as Folder[],
  ungroupedMemoCount: 0,
  isLoading: false,
  hasUser: true,
}));

vi.mock("@/hooks/useFolderQueries", () => ({
  useFolders: () => ({
    data: { folders: folderState.folders, ungroupedMemoCount: folderState.ungroupedMemoCount },
    isLoading: folderState.isLoading,
  }),
  useUpdateFolder: () => ({ mutateAsync: vi.fn() }),
  useDeleteFolder: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => (folderState.hasUser ? { name: "users/alice" } : undefined),
}));

vi.mock("@/hooks", () => ({
  useMemoFilters: (options: { folderUID?: string; ungroupedOnly?: boolean }) =>
    options.folderUID ? `folder_uid == "${options.folderUID}"` : options.ungroupedOnly ? `folder_uid == ""` : undefined,
  useMemoSorting: () => ({ listSort: undefined, orderBy: "pinned desc, create_time desc" }),
}));

vi.mock("@/contexts/NewMemoContext", () => ({
  NewMemoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const editorProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("@/components/MemoEditor", () => ({
  default: (props: Record<string, unknown>) => {
    editorProps.last = props;
    return <div data-testid="memo-editor" />;
  },
}));

vi.mock("@/components/MemoView", () => ({
  default: () => <div data-testid="memo-view" />,
}));

const listProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("@/components/PagedMemoList", () => ({
  default: (props: Record<string, unknown>) => {
    listProps.last = props;
    const renderLeading = props.renderLeading as (o: { useGrid: boolean }) => React.ReactNode;
    const renderer = props.renderer as (memo: { name: string }, o: { compact: boolean }) => React.ReactNode;
    return (
      <div data-testid="paged-memo-list">
        {renderLeading({ useGrid: false })}
        {renderer({ name: "memos/1" }, { compact: false })}
      </div>
    );
  },
  getMemoKey: (memo: { name: string }) => memo.name,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, string>) =>
    params ? Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), key) : key,
}));

const folder = (name: string, title: string, overrides: Partial<Folder> = {}): Folder =>
  ({ name, title, pinned: false, memoCount: 0, ...overrides }) as Folder;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/folders/:folderId" element={<FolderView />} />
      </Routes>
    </MemoryRouter>,
  );

describe("<FolderView>", () => {
  it("shows the folder feed and files new notes into the folder", () => {
    folderState.folders = [folder("users/alice/folders/work", "Work", { memoCount: 7 })];
    renderAt("/folders/work");

    expect(screen.getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(listProps.last?.filter).toBe(`folder_uid == "work"`);
    expect(listProps.last?.orderBy).toBe("pinned desc, create_time desc");
    expect(editorProps.last?.defaultFolderName).toBe("users/alice/folders/work");
  });

  it("ungrouped view filters memos without a folder and keeps the editor unfiled", () => {
    folderState.folders = [folder("users/alice/folders/work", "Work")];
    folderState.ungroupedMemoCount = 5;
    renderAt("/folders/ungrouped");

    expect(screen.getByRole("heading", { name: "folder.ungrouped" })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(listProps.last?.filter).toBe(`folder_uid == ""`);
    expect(editorProps.last?.defaultFolderName).toBeUndefined();
  });

  it("shows a recoverable not-found state for stale folder links", () => {
    folderState.folders = [folder("users/alice/folders/work", "Work")];
    renderAt("/folders/missing");

    expect(screen.getByText("folder.not-found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "folder.back-to-all-notes" })).toBeInTheDocument();
    expect(screen.queryByTestId("paged-memo-list")).not.toBeInTheDocument();
  });
});
