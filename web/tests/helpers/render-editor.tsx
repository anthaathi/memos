import { fireEvent, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import Editor from "@/components/MemoEditor/Editor";
import type { EditorController } from "@/components/MemoEditor/types/editorController";

const queries = vi.hoisted(() => ({
  useTagCounts: vi.fn(() => ({ data: {} as Record<string, number> })),
}));

/** The mocked useTagCounts query (see the vi.mock below). */
export const tagCountsMock = queries.useTagCounts;

vi.mock("@/hooks/useUserQueries", () => ({
  useTagCounts: queries.useTagCounts,
}));

export interface EditorHarnessOptions {
  initialContent?: string;
  contentIsExternal?: boolean;
  placeholder?: string;
  onExternalContentApplied?: (content: string) => void;
}

export interface EditorHarness {
  ref: React.RefObject<EditorController | null>;
  onChange: ReturnType<typeof vi.fn>;
  onSubmit: ReturnType<typeof vi.fn>;
  onFiles: ReturnType<typeof vi.fn>;
  rerender: (props: EditorHarnessOptions) => void;
  contentEditable: () => HTMLElement | null;
}

/** Render the real Editor component with spies on its callback props. */
export function renderEditor(options: EditorHarnessOptions = {}): EditorHarness {
  const ref = createRef<EditorController>();
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const onFiles = vi.fn();
  const props = {
    ref,
    className: "x",
    initialContent: options.initialContent ?? "",
    placeholder: options.placeholder ?? "memo",
    onContentChange: onChange,
    onFiles,
    onSubmit,
  };
  const utils = render(
    <Editor
      {...props}
      contentIsExternal={options.contentIsExternal}
      onExternalContentApplied={options.onExternalContentApplied}
    />,
  );
  return {
    ref,
    onChange,
    onSubmit,
    onFiles,
    rerender: (next: EditorHarnessOptions) =>
      utils.rerender(
        <Editor
          {...props}
          initialContent={next.initialContent ?? props.initialContent}
          placeholder={next.placeholder ?? props.placeholder}
          contentIsExternal={next.contentIsExternal ?? options.contentIsExternal}
          onExternalContentApplied={next.onExternalContentApplied ?? options.onExternalContentApplied}
        />,
      ),
    contentEditable: () => utils.container.querySelector<HTMLElement>(".editor-input"),
  };
}
