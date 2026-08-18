import { CheckIcon, FolderIcon, FolderMinusIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useFolders, useMoveMemoToFolder } from "@/hooks/useFolderQueries";
import { getFolderUID } from "@/lib/folders";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memo: Memo;
}

/**
 * Lists the user's folders plus an "Ungrouped" option and moves the memo on
 * select. The memo's current assignment is highlighted and selecting it is a
 * no-op that just closes the dialog.
 */
const MoveToFolderDialog = ({ open, onOpenChange, memo }: Props) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data, isLoading } = useFolders(currentUser?.name, { enabled: open && !!currentUser?.name });
  const { mutateAsync: moveMemoToFolder, isPending } = useMoveMemoToFolder();
  const [movingTo, setMovingTo] = useState<string | null>(null);

  const currentFolderUID = memo.folder ? getFolderUID(memo.folder) : "";

  const handleSelect = async (folderName: string, folderUID: string) => {
    if (folderUID === currentFolderUID) {
      onOpenChange(false);
      return;
    }
    setMovingTo(folderUID);
    try {
      await moveMemoToFolder({ memoName: memo.name, folderName });
      toast.success(t("folder.move-success"));
      onOpenChange(false);
    } catch (error) {
      toast.error(t("folder.move-failed"));
      console.error("Failed to move memo to folder:", error);
    } finally {
      setMovingTo(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("folder.move-to")}</DialogTitle>
          <DialogDescription>{t("folder.move-to-description")}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label={t("folder.move-to")}>
          {isLoading ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <button
                type="button"
                role="option"
                aria-selected={currentFolderUID === ""}
                disabled={isPending}
                onClick={() => handleSelect("", "")}
                className={cn(
                  "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  currentFolderUID === "" ? "font-medium" : "text-foreground",
                  movingTo === "" && "opacity-60",
                )}
              >
                <FolderMinusIcon className="size-4 shrink-0 opacity-70" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{t("folder.ungrouped")}</span>
                {currentFolderUID === "" && <CheckIcon className="size-4 shrink-0 text-accent-foreground/70" />}
              </button>
              {(data?.folders ?? []).map((folder) => {
                const uid = getFolderUID(folder.name);
                const isCurrent = uid === currentFolderUID;
                return (
                  <button
                    key={folder.name}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={isPending}
                    onClick={() => handleSelect(folder.name, uid)}
                    className={cn(
                      "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      isCurrent ? "font-medium" : "text-foreground",
                      movingTo === uid && "opacity-60",
                    )}
                  >
                    <FolderIcon className="size-4 shrink-0 opacity-70" strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate">{folder.title}</span>
                    {isCurrent && <CheckIcon className="size-4 shrink-0 text-accent-foreground/70" />}
                  </button>
                );
              })}
              {(data?.folders ?? []).length === 0 && (
                <p className="px-2 pb-2 pt-3 text-center text-xs text-muted-foreground">{t("folder.no-folders-hint")}</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MoveToFolderDialog;
