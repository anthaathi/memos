import { ROUTES } from "@/router/routes";

/**
 * Route segment for the virtual ungrouped collection: notes without a folder.
 * Reserved so it can never collide with a real folder UID.
 */
export const UNGROUPED_FOLDER_ID = "ungrouped";

/** Builds a folder resource name from a username and folder UID. */
export const buildFolderName = (userName: string, folderUID: string): string => `${userName}/folders/${folderUID}`;

/** Extracts the folder UID from a folder resource name (users/{user}/folders/{folder}). */
export const getFolderUID = (name: string): string => {
  const parts = name.split("/");
  return parts.length === 4 ? parts[3] : name;
};

/** Folder page path for a folder UID or the virtual ungrouped collection. */
export const getFolderPath = (folderId: string): string => `${ROUTES.FOLDERS}/${folderId}`;

export const getUngroupedFolderPath = (): string => getFolderPath(UNGROUPED_FOLDER_ID);
