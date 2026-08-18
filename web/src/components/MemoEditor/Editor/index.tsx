import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTagCounts } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import type { EditorController } from "../types/editorController";
import { createController } from "./controller";
import "./editor.css";
import { createFormattingController } from "./formatting";
import { MEMO_EDITOR_NODES } from "./nodes";
import { EditorPlugins } from "./plugins";
import { SelectionToolbar } from "./SelectionToolbar";
import { memoEditorTheme } from "./theme";

interface EditorProps {
  className: string;
  initialContent: string;
  contentIsExternal?: boolean;
  placeholder: string;
  onContentChange: (content: string) => void;
  onExternalContentApplied?: (content: string) => void;
  onFiles: (files: File[], position: number) => void;
  /** Invoked by the in-editor save shortcut (Cmd/Ctrl+Enter). */
  onSubmit: () => void;
  isFocusMode?: boolean;
}

/**
 * The memo editor: Lexical rich text over a Markdown document. Everything
 * above the editor boundary still talks markdown through the EditorController
 * contract; see Editor/markdown.ts for the round-trip rules.
 */
const Editor = forwardRef<EditorController, EditorProps>(function Editor(props, ref) {
  const {
    className,
    initialContent,
    contentIsExternal = true,
    placeholder,
    onContentChange,
    onExternalContentApplied,
    onFiles,
    onSubmit,
    isFocusMode,
  } = props;
  // A user can only author their own memos. Reuse the current-user stats query
  // instead of fetching and aggregating every user's tags for autocomplete.
  const { data: tagData } = useTagCounts(true);
  const tags = useMemo(() => Object.keys(tagData ?? {}), [tagData]);

  const initialConfig = useMemo(
    () => ({
      namespace: "MemoEditor",
      theme: memoEditorTheme,
      nodes: MEMO_EDITOR_NODES,
      onError: (error: Error) => {
        if (import.meta.env.DEV) throw error;
        console.error(error);
      },
    }),
    // Seed once; later external content flows through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div
      className={cn("relative flex w-full flex-col items-start justify-start bg-inherit", isFocusMode && "min-h-0 flex-1", className)}
      data-focus-mode={isFocusMode || undefined}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorSurface
          controllerRef={ref}
          className={isFocusMode ? "min-h-0 flex-1 w-full" : "w-full"}
          placeholder={placeholder}
          initialContent={initialContent}
          contentIsExternal={contentIsExternal}
          onContentChange={onContentChange}
          onExternalContentApplied={onExternalContentApplied}
          onFiles={onFiles}
          onSubmit={onSubmit}
          getTags={() => tags}
        />
      </LexicalComposer>
    </div>
  );
});

interface EditorSurfaceProps {
  controllerRef: React.ForwardedRef<EditorController>;
  className: string;
  placeholder: string;
  initialContent: string;
  contentIsExternal: boolean;
  onContentChange: (content: string) => void;
  onExternalContentApplied?: (content: string) => void;
  onFiles: (files: File[], position: number) => void;
  onSubmit: () => void;
  getTags: () => string[];
}

/** Wires the Lexical editor to the EditorController contract and React props. */
function EditorSurface({
  controllerRef,
  className,
  placeholder,
  initialContent,
  contentIsExternal,
  onContentChange,
  onExternalContentApplied,
  onFiles,
  onSubmit,
  getTags,
}: EditorSurfaceProps) {
  const [editor] = useLexicalComposerContext();
  // The floating selection toolbar renders from state (the controller itself
  // only flows to the forwarded ref, which React doesn't observe).
  const [formatting, setFormatting] = useState<ReturnType<typeof createFormattingController> | null>(null);
  const applyingExternalRef = useRef(false);
  const composingRef = useRef(false);
  const pendingExternalContentRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const onExternalContentAppliedRef = useRef(onExternalContentApplied);
  onExternalContentAppliedRef.current = onExternalContentApplied;
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const getTagsRef = useRef(getTags);
  getTagsRef.current = getTags;

  const applyExternalContent = useCallback(
    (content: string) => {
      pendingExternalContentRef.current = null;
      const controller = controllerRef && typeof controllerRef === "object" ? controllerRef.current : null;
      if (!controller || controller.getMarkdown() === content) return;
      applyingExternalRef.current = true;
      try {
        controller.setMarkdown(content);
      } finally {
        applyingExternalRef.current = false;
      }
    },
    [controllerRef],
  );

  // useLayoutEffect so the editor (and its placeholder) mount before the
  // browser paints; with useEffect the first painted frame shows an empty host.
  useLayoutEffect(() => {
    const setController = (controller: EditorController | null) => {
      if (typeof controllerRef === "function") controllerRef(controller);
      else if (controllerRef) controllerRef.current = controller;
    };
    const formatting = createFormattingController(editor, listenersRef.current);
    setController(createController(editor, formatting));
    setFormatting(formatting);

    const handleCompositionStart = () => {
      composingRef.current = true;
    };
    const handleCompositionEnd = () => {
      composingRef.current = false;
      // Lexical may flush its final IME DOM mutations in a microtask after
      // compositionend. Queue behind that flush before replacing the document
      // with a deferred external value.
      queueMicrotask(() => {
        if (composingRef.current || editor.isComposing()) return;
        const pendingContent = pendingExternalContentRef.current;
        if (pendingContent === null) return;
        applyExternalContent(pendingContent);
        // The composition may have emitted a newer local value after this
        // deferred external value entered the store. Reassert the applied
        // external value there too.
        onExternalContentAppliedRef.current?.(pendingContent);
      });
    };
    const rootElement = editor.getRootElement();
    rootElement?.addEventListener("compositionstart", handleCompositionStart);
    rootElement?.addEventListener("compositionend", handleCompositionEnd);
    return () => {
      rootElement?.removeEventListener("compositionstart", handleCompositionStart);
      rootElement?.removeEventListener("compositionend", handleCompositionEnd);
      setController(null);
    };
    // Mount once; external sync handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!contentIsExternal) return;
    if (composingRef.current || editor.isComposing()) {
      pendingExternalContentRef.current = initialContent;
      return;
    }
    applyExternalContent(initialContent);
  }, [applyExternalContent, contentIsExternal, editor, initialContent]);

  return (
    <div className={cn("relative flex w-full flex-col text-base", className)}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="editor-input"
            autoCorrect="on"
            aria-placeholder={placeholder}
            placeholder={<div className="editor-placeholder">{placeholder}</div>}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <EditorPlugins
        onChange={(markdown) => onChangeRef.current(markdown)}
        onUpdate={() => listenersRef.current.forEach((listener) => listener())}
        onFiles={(files) => onFilesRef.current(files, 0)}
        onSubmit={() => onSubmitRef.current()}
        isApplyingExternal={() => applyingExternalRef.current}
        getTags={() => getTagsRef.current()}
      />
      <SelectionToolbar formatting={formatting} />
    </div>
  );
}

export default Editor;
