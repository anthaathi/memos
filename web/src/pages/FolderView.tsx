import { FolderIcon, FolderMinusIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import MemoEditor from "@/components/MemoEditor";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import Placeholder from "@/components/Placeholder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDeleteFolder, useFolders, useUpdateFolder } from "@/hooks/useFolderQueries";
import { getFolderUID, UNGROUPED_FOLDER_ID } from "@/lib/folders";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

/**
 * A single folder's feed: `/folders/{uid}` shows the folder's notes,
 * `/folders/ungrouped` shows notes without a folder. Creating from the editor
 * files the new note into the folder automatically (ungrouped stays ungrouped).
 */
const FolderView = () => {
  const { folderId = "" } = useParams();
  const t = useTranslate();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isUngrouped = folderId === UNGROUPED_FOLDER_ID;

  const { data, isLoading } = useFolders(user?.name, { enabled: !!user?.name });
  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const folder = isUngrouped ? undefined : data?.folders.find((f) => getFolderUID(f.name) === folderId);
  const folderMissing = !isUngrouped && !isLoading && !!user && !folder;

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includePinned: true,
    folderUID: isUngrouped || !folder ? undefined : folderId,
    ungroupedOnly: isUngrouped || undefined,
  });
  const { listSort, orderBy } = useMemoSorting({ pinnedFirst: true, state: State.NORMAL });

  const handleRename = async () => {
    if (!folder) return;
    const title = renameValue.trim();
    if (!title) return;
    try {
      await updateFolder({ folder: { name: folder.name, title }, updateMask: ["title"] });
      toast.success(t("folder.rename-success"));
      setRenameOpen(false);
    } catch (error) {
      console.error("Failed to rename folder:", error);
      toast.error(t("folder.action-failed"));
    }
  };

  const handleDelete = async () => {
    if (!folder) return;
    try {
      await deleteFolder(folder.name);
      toast.success(t("folder.delete-success", { title: folder.title }));
      setDeleteOpen(false);
      navigate(ROUTES.HOME);
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast.error(t("folder.action-failed"));
    }
  };

  if (folderMissing) {
    return (
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-2 bg-background text-foreground">
        <Placeholder variant="notFound" message={t("folder.not-found")}>
          <Button onClick={() => navigate(ROUTES.HOME)}>{t("folder.back-to-all-notes")}</Button>
        </Placeholder>
      </div>
    );
  }

  const title = isUngrouped ? t("folder.ungrouped") : (folder?.title ?? "");
  const count = isUngrouped ? data?.ungroupedMemoCount : folder?.memoCount;

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      <div className="mb-3 flex min-h-9 items-center gap-2">
        {isUngrouped ? (
          <FolderMinusIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        ) : (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        )}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={title}>
          {title}
        </h1>
        {count != null && count > 0 && <span className="text-sm tabular-nums text-muted-foreground/70">{count}</span>}
        {!isUngrouped && folder && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={t("common.more")} />}
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} size="sm">
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(folder.title);
                  setRenameOpen(true);
                }}
              >
                <PencilIcon className="w-4 h-auto" />
                {t("common.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void updateFolder({ folder: { name: folder.name, pinned: !folder.pinned }, updateMask: ["pinned"] }).catch((error) => {
                    console.error("Failed to update folder:", error);
                    toast.error(t("folder.action-failed"));
                  });
                }}
              >
                {folder.pinned ? <PinOffIcon className="w-4 h-auto" /> : <PinIcon className="w-4 h-auto" />}
                {folder.pinned ? t("common.unpin") : t("common.pin")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon className="w-4 h-auto" />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <NewMemoProvider>
        <PagedMemoList
          renderer={(memo: Memo, { compact }) => (
            <MemoView key={getMemoKey(memo)} memo={memo} showVisibility showPinned compact={compact} />
          )}
          listSort={listSort}
          orderBy={orderBy}
          filter={memoFilter}
          renderLeading={({ useGrid }) => (
            <MemoEditor
              className={useGrid ? undefined : "mb-2"}
              cacheKey={`folder-${isUngrouped ? UNGROUPED_FOLDER_ID : folderId}`}
              placeholder={t("editor.any-thoughts")}
              defaultFolderName={isUngrouped ? undefined : folder?.name}
            />
          )}
        />
      </NewMemoProvider>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("folder.rename")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRename();
            }}
          >
            <Input
              autoFocus
              value={renameValue}
              maxLength={64}
              aria-label={t("folder.rename")}
              placeholder={t("folder.title-placeholder")}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("folder.delete-confirm", { title: folder?.title ?? "" })}</DialogTitle>
            <DialogDescription>{t("folder.delete-confirm-description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FolderView;
