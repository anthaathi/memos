import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateFolder, useDeleteFolder, useFolders, useMoveMemoToFolder, useUpdateFolder } from "@/hooks/useFolderQueries";

const clients = vi.hoisted(() => ({
  folderServiceClient: {
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
  memoServiceClient: {
    updateMemo: vi.fn(),
  },
}));

vi.mock("@/connect", () => clients);

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => ({ name: "users/alice" }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("folder queries", () => {
  beforeEach(() => {
    for (const client of Object.values(clients.folderServiceClient)) client.mockReset();
    clients.memoServiceClient.updateMemo.mockReset();
  });

  it("lists folders with the ungrouped count", async () => {
    clients.folderServiceClient.listFolders.mockResolvedValue({
      folders: [{ name: "users/alice/folders/work", title: "Work", pinned: true, memoCount: 2 }],
      ungroupedMemoCount: 3,
    });

    const { result } = renderHook(() => useFolders("users/alice"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(clients.folderServiceClient.listFolders).toHaveBeenCalledWith({ parent: "users/alice" });
    expect(result.current.data?.folders).toHaveLength(1);
    expect(result.current.data?.folders[0].title).toBe("Work");
    expect(result.current.data?.ungroupedMemoCount).toBe(3);
  });

  it("returns an empty result without a parent", async () => {
    const { result } = renderHook(() => useFolders(undefined), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(clients.folderServiceClient.listFolders).not.toHaveBeenCalled();
  });

  it("creates folders for the current user", async () => {
    clients.folderServiceClient.createFolder.mockResolvedValue({ name: "users/alice/folders/x", title: "X" });

    const { result } = renderHook(() => useCreateFolder(), { wrapper });
    await result.current.mutateAsync({ parent: "users/alice", title: "X" });

    expect(clients.folderServiceClient.createFolder).toHaveBeenCalledWith({
      parent: "users/alice",
      folder: expect.objectContaining({ title: "X" }),
    });
  });

  it("updates folders with a field mask", async () => {
    clients.folderServiceClient.updateFolder.mockResolvedValue({ name: "users/alice/folders/x", pinned: true });

    const { result } = renderHook(() => useUpdateFolder(), { wrapper });
    await result.current.mutateAsync({ folder: { name: "users/alice/folders/x", pinned: true }, updateMask: ["pinned"] });

    expect(clients.folderServiceClient.updateFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: expect.objectContaining({ name: "users/alice/folders/x" }),
        updateMask: expect.objectContaining({ paths: ["pinned"] }),
      }),
    );
  });

  it("deletes folders and invalidates memo caches", async () => {
    clients.folderServiceClient.deleteFolder.mockResolvedValue({});

    const { result } = renderHook(() => useDeleteFolder(), { wrapper });
    await result.current.mutateAsync("users/alice/folders/x");

    expect(clients.folderServiceClient.deleteFolder).toHaveBeenCalledWith({ name: "users/alice/folders/x" });
  });

  it("moves a memo to a folder via the folder mask path", async () => {
    clients.memoServiceClient.updateMemo.mockResolvedValue({ name: "memos/1", folder: "users/alice/folders/x" });

    const { result } = renderHook(() => useMoveMemoToFolder(), { wrapper });
    await result.current.mutateAsync({ memoName: "memos/1", folderName: "users/alice/folders/x" });

    expect(clients.memoServiceClient.updateMemo).toHaveBeenCalledWith(
      expect.objectContaining({
        updateMask: expect.objectContaining({ paths: ["folder"] }),
      }),
    );

    clients.memoServiceClient.updateMemo.mockClear();
    await result.current.mutateAsync({ memoName: "memos/1", folderName: "" });
    const clearCall = clients.memoServiceClient.updateMemo.mock.calls[0][0];
    expect(clearCall.memo.folder).toBe("");
    expect(clearCall.updateMask.paths).toEqual(["folder"]);
  });
});
