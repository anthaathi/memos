import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FoldersSection from "@/components/AppSidebar/FoldersSection";
import type { Folder } from "@/types/proto/api/v1/folder_service_pb";

const folderHooks = vi.hoisted(() => ({
  data: undefined as { folders: Folder[]; ungroupedMemoCount: number } | undefined,
  isLoading: false,
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => ({ name: "users/alice" }),
}));

vi.mock("@/contexts/AppSidebarContext", () => ({
  useAppSidebar: () => ({ setMobileOpen: vi.fn() }),
}));

vi.mock("@/hooks/useFolderQueries", () => ({
  useFolders: () => ({ data: folderHooks.data, isLoading: folderHooks.isLoading }),
  useCreateFolder: () => ({ mutateAsync: folderHooks.createFolder }),
  useUpdateFolder: () => ({ mutateAsync: folderHooks.updateFolder }),
  useDeleteFolder: () => ({ mutateAsync: folderHooks.deleteFolder }),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, string>) =>
    params ? Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), key) : key,
}));

const folder = (name: string, title: string, overrides: Partial<Folder> = {}): Folder =>
  ({ name, title, pinned: false, memoCount: 0, ...overrides }) as Folder;

const renderSection = (initialEntry = "/") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FoldersSection />
    </MemoryRouter>,
  );

describe("<FoldersSection>", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    folderHooks.createFolder.mockReset().mockResolvedValue({ name: "users/alice/folders/new", title: "New" });
    folderHooks.updateFolder.mockReset().mockResolvedValue({});
    folderHooks.deleteFolder.mockReset().mockResolvedValue({});
    folderHooks.data = {
      folders: [
        folder("users/alice/folders/pinned-one", "Pinned one", { pinned: true, memoCount: 3 }),
        folder("users/alice/folders/work", "Work", { memoCount: 12 }),
      ],
      ungroupedMemoCount: 4,
    };
    folderHooks.isLoading = false;
  });

  it("renders all notes, ungrouped with count, and folders in server order", () => {
    renderSection();

    expect(screen.getByText("folder.all-notes")).toBeInTheDocument();
    expect(screen.getByText("folder.ungrouped")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Pinned one")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    const rows = screen.getAllByRole("button").map((b) => b.textContent);
    const pinnedIndex = rows.findIndex((r) => r?.includes("Pinned one"));
    const workIndex = rows.findIndex((r) => r?.includes("Work"));
    expect(pinnedIndex).toBeGreaterThan(-1);
    expect(pinnedIndex).toBeLessThan(workIndex);
  });

  it("links ungrouped and folder rows to their pages and marks the active one", () => {
    renderSection("/folders/work");

    const ungrouped = screen.getByRole("link", { name: /folder\.ungrouped/ });
    expect(ungrouped).toHaveAttribute("href", "/folders/ungrouped");
    const work = screen.getByRole("button", { name: "Work12" });
    expect(work).toHaveAttribute("aria-pressed", "true");
    const home = screen.getByRole("link", { name: /folder\.all-notes/ });
    expect(home).toHaveAttribute("href", "/");
  });

  it("creates a folder from the header action", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "folder.create" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Projects" } });
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() =>
      expect(folderHooks.createFolder).toHaveBeenCalledWith({ parent: "users/alice", title: "Projects" }),
    );
  });

  it("renames a folder from its row menu", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "common.edit Work" }));
    fireEvent.click(await screen.findByText("common.rename"));
    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("Work");
    fireEvent.change(input, { target: { value: "Work 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(folderHooks.updateFolder).toHaveBeenCalledWith({
        folder: { name: "users/alice/folders/work", title: "Work 2026" },
        updateMask: ["title"],
      }),
    );
  });

  it("toggles folder pinning from its row menu", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "common.edit Work" }));
    fireEvent.click(await screen.findByText("common.pin"));

    await waitFor(() =>
      expect(folderHooks.updateFolder).toHaveBeenCalledWith({
        folder: { name: "users/alice/folders/work", pinned: true },
        updateMask: ["pinned"],
      }),
    );
  });

  it("deletes a folder after confirming that notes move to ungrouped", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "common.edit Work" }));
    fireEvent.click(await screen.findByText("common.delete"));

    expect(await screen.findByText("folder.delete-confirm-description")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));
    await waitFor(() => expect(folderHooks.deleteFolder).toHaveBeenCalledWith("users/alice/folders/work"));
  });

  it("shows an empty hint when there are no folders", () => {
    folderHooks.data = { folders: [], ungroupedMemoCount: 0 };
    renderSection();

    expect(screen.getByText("folder.empty-hint")).toBeInTheDocument();
  });
});
