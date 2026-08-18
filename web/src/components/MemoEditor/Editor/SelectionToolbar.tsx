import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, $getSelection, $isRangeSelection, type LexicalNode } from "lexical";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Translations } from "@/utils/i18n";
import { type ActiveFormatState, EDITOR_COMMANDS, EMPTY_ACTIVE_FORMATS, isCommandActive } from "../formatting/commands";
import type { FormattingController } from "../types/editorController";
import { $isRawMarkdownNode } from "./nodes/RawMarkdownNode";

/** Inline marks only — block verbs belong to the static toolbar. */
const SELECTION_COMMANDS = EDITOR_COMMANDS.filter((command) => command.group === "mark");

const GAP = 8;
/** Fallbacks until the real element is measurable (first show / jsdom). */
const ESTIMATED_WIDTH = 180;
const ESTIMATED_HEIGHT = 36;

interface ToolbarPosition {
  top: number;
  left: number;
}

interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

const ZERO_RECT: SelectionRect = { top: 0, bottom: 0, left: 0, width: 0 };

/** Can marks apply to the committed selection? (Range over real text, outside
 *  code/raw-markdown blocks where inline formatting has no effect.) */
function $selectionAcceptsMarks(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  if (selection.getTextContent().trim().length === 0) return false;
  const anchor = selection.anchor.getNode();
  const opaque = (node: LexicalNode): boolean => $isCodeNode(node) || $isRawMarkdownNode(node);
  return $findMatchingParent(anchor, opaque) === null;
}

/**
 * Floating toolbar over an active text selection: the inline marks from the
 * shared catalog (bold, italic, strikethrough, code). It appears the moment a
 * non-collapsed selection exists inside editable rich text, tracks the
 * selection (typing, scrolling, resize), and hides when the selection
 * collapses, moves outside this editor, or the editor blurs. Buttons suppress
 * mousedown focus so clicking one never drops the selection it targets.
 */
export function SelectionToolbar({ formatting }: { formatting: FormattingController | null }) {
  const [editor] = useLexicalComposerContext();
  // Non-suspending translation: the default useTranslate suspends until i18n
  // resources load, which would defer the editor's whole mount on it.
  const { t } = useTranslation<Translations>(undefined, { useSuspense: false });
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const [active, setActive] = useState<ActiveFormatState>(EMPTY_ACTIVE_FORMATS);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const evaluate = useCallback(() => {
    if (!formatting || !editor.read($selectionAcceptsMarks)) {
      setPosition(null);
      return;
    }
    // The DOM selection must still live in this editor (it moves when the
    // user selects text elsewhere on the page).
    const root = editor.getRootElement();
    const domSelection = window.getSelection();
    if (
      domSelection !== null &&
      domSelection.rangeCount > 0 &&
      domSelection.anchorNode &&
      root &&
      !root.contains(domSelection.anchorNode)
    ) {
      setPosition(null);
      return;
    }
    setActive(formatting.getActiveFormats());
    // Viewport-space rect of the selection; jsdom has no layout, so fall back
    // to a zero rect (the toolbar then parks at the top-left).
    const domRange = domSelection !== null && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0).getBoundingClientRect() : null;
    const rect: SelectionRect = domRange
      ? { top: domRange.top, bottom: domRange.bottom, left: domRange.left, width: domRange.width }
      : ZERO_RECT;
    const element = toolbarRef.current;
    const width = element?.offsetWidth || ESTIMATED_WIDTH;
    const height = element?.offsetHeight || ESTIMATED_HEIGHT;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    // Prefer above the selection; flip below when it would leave the viewport.
    let top = rect.top - GAP - height;
    if (top < GAP) top = Math.min(rect.bottom + GAP, Math.max(GAP, viewportHeight - height - GAP));
    // Center on the selection, clamped inside the viewport.
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - width / 2, GAP), Math.max(viewportWidth - width - GAP, GAP));
    setPosition({ top, left });
  }, [editor, formatting]);

  useLayoutEffect(() => {
    const root = editor.getRootElement();
    const hide = () => {
      setPosition(null);
    };
    // The editable is its own scroller; scroll doesn't bubble, so listen on it.
    root?.addEventListener("scroll", evaluate);
    root?.addEventListener("blur", hide);
    window.addEventListener("resize", evaluate);
    const unregisterUpdates = editor.registerUpdateListener(evaluate);
    evaluate();
    return () => {
      root?.removeEventListener("scroll", evaluate);
      root?.removeEventListener("blur", hide);
      window.removeEventListener("resize", evaluate);
      unregisterUpdates();
    };
  }, [editor, evaluate]);

  if (!position || !formatting) return null;

  return (
    <div ref={toolbarRef} className="memo-selection-toolbar" role="toolbar" aria-label={t("editor.formatting-toolbar")} style={position}>
      {SELECTION_COMMANDS.map((command) => {
        const Icon = command.icon;
        const label = t(command.labelKey);
        return (
          <button
            key={command.id}
            type="button"
            className="memo-selection-toolbar-button"
            aria-label={label}
            aria-pressed={isCommandActive(active, command.id)}
            title={label}
            // Must not steal focus on press — that would blur the editor and
            // drop the very selection the command targets.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              formatting.run(command.id);
              evaluate();
            }}
          >
            {Icon && <Icon className="w-4 h-4" />}
          </button>
        );
      })}
    </div>
  );
}
