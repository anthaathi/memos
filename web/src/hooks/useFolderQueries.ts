import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { folderServiceClient, memoServiceClient } from "@/connect";
import { userKeys } from "@/hooks/useUserQueries";
import type { Folder } from "@/types/proto/api/v1/folder_service_pb";
import { FolderSchema } from "@/types/proto/api/v1/folder_service_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

/** Query keys for the current user's folders. */
export const folderKeys = {
  all: ["folders"] as const,
  list: (parent?: string) => [...folderKeys.all, "list", parent] as const,
};

export interface FolderListResult {
  folders: Folder[];
  ungroupedMemoCount: number;
}

/** Lists the current user's folders plus the ungrouped memo count. */
export function useFolders(parent?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: folderKeys.list(parent),
    queryFn: async (): Promise<FolderListResult> => {
      if (!parent) return { folders: [], ungroupedMemoCount: 0 };
      const response = await folderServiceClient.listFolders({ parent });
      return { folders: response.folders, ungroupedMemoCount: response.ungroupedMemoCount };
    },
    enabled: (options?.enabled ?? true) && !!parent,
  });
}

/** Creates a folder for the current user. */
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ parent, title }: { parent: string; title: string }) => {
      const folder = await folderServiceClient.createFolder({ parent, folder: create(FolderSchema, { title }) });
      return folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

/** Updates the selected fields of a folder. */
export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folder, updateMask }: { folder: Partial<Folder>; updateMask: string[] }) => {
      const updated = await folderServiceClient.updateFolder({
        folder: create(FolderSchema, folder as Record<string, unknown>),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      });
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}

/** Deletes a folder; its memos become ungrouped. */
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await folderServiceClient.deleteFolder({ name });
      return name;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      // Folder deletes move memos between collections.
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
    },
  });
}

/** Moves a memo to a folder; an empty folder name makes it ungrouped. */
export function useMoveMemoToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memoName, folderName }: { memoName: string; folderName: string }) => {
      const memo = await memoServiceClient.updateMemo({
        memo: create(MemoSchema, { name: memoName, folder: folderName } as Record<string, unknown>),
        updateMask: create(FieldMaskSchema, { paths: ["folder"] }),
      });
      return memo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memos"] });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
    },
  });
}
