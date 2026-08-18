import {
  FolderIcon,
  FolderMinusIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useCreateFolder, useDeleteFolder, useFolders, useUpdateFolder } from "@/hooks/useFolderQueries";
import { getFolderPath, getFolderUID, UNGROUPED_FOLDER_ID } from "@/lib/folders";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import type { Folder } from "@/types/proto/api/v1/folder_service_pb";
import { useTranslate } from "@/utils/i18n";
import { SIDEBAR_ROW_CLASSES, SIDEBAR_ROW_ICON_CLASSES, sidebarRowStateClasses } from "./SidebarRow";
import SidebarSection, { SIDEBAR_SECTION_ACTION_BUTTON_CLASSES, SIDEBAR_SECTION_ACTION_ICON_CLASSES } from "./SidebarSection";

/** Create/rename dialog with a single title input. */
const FolderNameDialog = ({
  open,
  onOpenChange,
  title,
  description,
  initialTitle,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialTitle?: string;
  confirmLabel: string;
  onConfirm: (title: string) => Promise<void>;
}) => {
  const t = useTranslate();
  const [value, setValue] = useState(initialTitle ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialTitle ?? "");
    }
  }, [open, initialTitle]);

  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 64;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } catch (error) {
      console.error("Folder dialog action failed:", error);
      toast.error(t("folder.action-failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <Input
            autoFocus
            value={value}
            maxLength={64}
            aria-label={title}
            placeholder={t("folder.title-placeholder")}
            onChange={(e) => setValue(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const FoldersSection = ({ children }: { children?: ReactNode }) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useCurrentUser();
  const { setMobileOpen } = useAppSidebar();
  const { data, isLoading } = useFolders(currentUser?.name);
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);

  const folderMatch = matchPath(`${ROUTES.FOLDERS}/:folderId`, location.pathname);
  const activeFolderId = folderMatch?.params.folderId;

  const goToFolder = (folderId: string) => {
    navigate(getFolderPath(folderId));
    setMobileOpen(false);
  };

  const folders = data?.folders ?? [];

  return (
    <SidebarSection
      label={t("common.folders")}
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          className={SIDEBAR_SECTION_ACTION_BUTTON_CLASSES}
          onClick={() => setCreateOpen(true)}
          aria-label={t("folder.create")}
        >
          <PlusIcon className={SIDEBAR_SECTION_ACTION_ICON_CLASSES} strokeWidth={1.8} />
        </Button>
      }
    >
      <Link
        to={ROUTES.HOME}
        onClick={() => setMobileOpen(false)}
        className={cn(SIDEBAR_ROW_CLASSES, sidebarRowStateClasses(location.pathname === ROUTES.HOME))}
      >
        <LayersIcon className={SIDEBAR_ROW_ICON_CLASSES} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-left">{t("folder.all-notes")}</span>
      </Link>
      <Link
        to={getFolderPath(UNGROUPED_FOLDER_ID)}
        onClick={() => setMobileOpen(false)}
        className={cn(SIDEBAR_ROW_CLASSES, sidebarRowStateClasses(activeFolderId === UNGROUPED_FOLDER_ID))}
      >
        <FolderMinusIcon className={SIDEBAR_ROW_ICON_CLASSES} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-left">{t("folder.ungrouped")}</span>
        {data && data.ungroupedMemoCount > 0 && (
          <span className="text-2xs tabular-nums text-muted-foreground/60">{data.ungroupedMemoCount}</span>
        )}
      </Link>
      {folders.map((folder) => {
        const id = getFolderUID(folder.name);
        return (
          <div key={folder.name} className={cn(SIDEBAR_ROW_CLASSES, "group/folder", sidebarRowStateClasses(activeFolderId === id))}>
            <button
              type="button"
              onClick={() => goToFolder(id)}
              aria-pressed={activeFolderId === id || undefined}
              className="flex h-full min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <FolderIcon className={cn(SIDEBAR_ROW_ICON_CLASSES, "shrink-0")} strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">{folder.title}</span>
              {folder.pinned && (
                <span title={t("common.pinned")}>
                  <PinIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/50" strokeWidth={1.8} />
                </span>
              )}
              {folder.memoCount > 0 && <span className="text-2xs tabular-nums text-muted-foreground/60">{folder.memoCount}</span>}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton={false}
                render={
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${t("common.edit")} ${folder.title}`}
                    className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-background/70 md:opacity-0 md:group-hover/folder:opacity-100 md:focus-visible:opacity-100 data-popup-open:opacity-100"
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={2} size="sm">
                <DropdownMenuItem onClick={() => setRenameTarget(folder)}>
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
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(folder)}>
                  <Trash2Icon className="w-4 h-auto" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
      {isLoading && <p className="px-2 py-1 text-2xs text-muted-foreground/60">{t("folder.loading")}</p>}
      {!isLoading && folders.length === 0 && <p className="px-2 py-1 text-2xs text-muted-foreground/60">{t("folder.empty-hint")}</p>}
      {children}

      <FolderNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("folder.create")}
        description={t("folder.create-description")}
        confirmLabel={t("common.create")}
        onConfirm={async (title) => {
          if (!currentUser?.name) return;
          const folder = await createFolder({ parent: currentUser.name, title });
          toast.success(t("folder.create-success", { title: folder.title }));
        }}
      />
      <FolderNameDialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        title={t("folder.rename")}
        initialTitle={renameTarget?.title}
        confirmLabel={t("common.save")}
        onConfirm={async (title) => {
          if (!renameTarget) return;
          await updateFolder({ folder: { name: renameTarget.name, title }, updateMask: ["title"] });
          toast.success(t("folder.rename-success"));
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("folder.delete-confirm", { title: deleteTarget?.title ?? "" })}
        description={t("folder.delete-confirm-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          try {
            await deleteFolder(target.name);
            if (activeFolderId === getFolderUID(target.name)) {
              navigate(ROUTES.HOME);
            }
            toast.success(t("folder.delete-success", { title: target.title }));
          } catch (error) {
            console.error("Failed to delete folder:", error);
            toast.error(t("folder.action-failed"));
            throw error;
          }
        }}
      />
    </SidebarSection>
  );
};

export default FoldersSection;
