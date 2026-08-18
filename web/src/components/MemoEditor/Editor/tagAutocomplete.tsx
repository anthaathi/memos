import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $findMatchingParent,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
} from "lexical";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isTagIntroducerAt, scanTagAt } from "@/utils/tag-grammar";

/**
 * `#tag` autocomplete for the Lexical editor. The ranking grammar is shared
 * with the decorated-source editor: nested tags are paths, so a match inside
 * the path counts, ranked full-path prefix > path-segment start > loose
 * substring. Opaque contexts (inline code, code blocks, links, raw blocks)
 * never offer completions.
 */

export interface TagQuery {
  /** Offset of the `#` introducer within the text node. */
  from: number;
  /** Offset just past the typed tag (the caret). */
  to: number;
  /** Emitted tag value typed so far (ignoring ignored code points). */
  typed: string;
}

/** The tag being typed at `caret` within `text`, if any. */
export function tagQueryAt(text: string, caret: number): TagQuery | undefined {
  const limit = Math.max(0, caret - 200);
  for (let index = caret - 1; index >= limit; index--) {
    if (text[index] !== "#" || !isTagIntroducerAt(text, index, caret)) continue;
    const match = scanTagAt(text, index, caret);
    if (match && match.to === caret) return { from: index, to: caret, typed: match.value };
  }
  return undefined;
}

const matchRank = (tag: string, typed: string): number | undefined => {
  const index = tag.indexOf(typed);
  if (index < 0) return undefined;
  if (index === 0) return 0; // Full-path prefix.
  if (tag[index - 1] === "/") return 1; // Path-segment start.
  return 2; // Anywhere else.
};

/** Rank known tags against the typed value; stable within a tier. */
export function rankTagCandidates(typed: string, tags: string[]): string[] {
  const lowered = typed.toLowerCase();
  return tags
    .map((tag) => ({ tag, rank: matchRank(tag.toLowerCase(), lowered) }))
    .filter((candidate): candidate is { tag: string; rank: number } => candidate.rank !== undefined)
    .sort((a, b) => a.rank - b.rank)
    .map(({ tag }) => tag);
}

const MENU_LIMIT = 20;

interface MenuState {
  options: string[];
  highlighted: number;
  top: number;
  left: number;
}

export function TagAutocompletePlugin({ getTags }: { getTags: () => string[] }) {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // The active query's node key, so keyboard handlers act on the same node the
  // menu was opened for.
  const queryKeyRef = useRef<string | null>(null);

  const closeMenu = useCallback(() => {
    queryKeyRef.current = null;
    setMenu(null);
  }, []);

  const recompute = useCallback(() => {
    const result = editor.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node) || node.hasFormat("code")) return null;
      const opaque =
        $findMatchingParent(node, (parent) => {
          const type = parent.getType();
          return type === "code" || type === "link" || type === "raw-markdown";
        }) !== null;
      if (opaque) return null;
      const query = tagQueryAt(node.getTextContent(), selection.anchor.offset);
      if (!query) return null;
      const options = rankTagCandidates(query.typed, getTags()).slice(0, MENU_LIMIT);
      if (options.length === 0) return null;
      return { query, options, key: node.getKey() };
    });
    if (!result) {
      closeMenu();
      return;
    }
    queryKeyRef.current = result.key;
    const rect = caretRect();
    setMenu((previous) => ({
      options: result.options,
      // Keep the highlighted row while the user arrows through a stable list.
      highlighted: previous && sameOptions(previous.options, result.options) ? previous.highlighted : 0,
      top: rect.bottom,
      left: rect.left,
    }));
  }, [closeMenu, editor, getTags]);

  const accept = useCallback(
    (tag: string) => {
      const key = queryKeyRef.current;
      closeMenu();
      editor.update(() => {
        const node = key !== null ? $getNodeByKey(key) : null;
        const selection = $getSelection();
        if (!$isTextNode(node) || !$isRangeSelection(selection)) return;
        const caret = selection.anchor.getNode() === node ? selection.anchor.offset : node.getTextContentSize();
        const query = tagQueryAt(node.getTextContent(), caret);
        if (!query) return;
        const text = node.getTextContent();
        node.setTextContent(`${text.slice(0, query.from)}#${tag}${text.slice(query.to)}`);
        node.select(query.from + tag.length + 1, query.from + tag.length + 1);
      });
    },
    [closeMenu, editor],
  );

  useLayoutEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => recompute()),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!menu) return false;
          event.preventDefault();
          setMenu((current) => current && { ...current, highlighted: (current.highlighted + 1) % current.options.length });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!menu) return false;
          event.preventDefault();
          setMenu(
            (current) =>
              current && { ...current, highlighted: (current.highlighted - 1 + current.options.length) % current.options.length },
          );
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!menu) return false;
          event?.preventDefault();
          accept(menu.options[menu.highlighted]!);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (!menu) return false;
          event.preventDefault();
          accept(menu.options[menu.highlighted]!);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Escape closes the menu only; a second Escape blurs (plugins.tsx).
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!menu) return false;
          closeMenu();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [accept, closeMenu, editor, menu, recompute]);

  if (!menu) return null;
  return (
    <div className="memo-tag-autocomplete" role="listbox" style={{ position: "fixed", top: menu.top, left: menu.left }}>
      {menu.options.map((tag, index) => (
        <button
          key={tag}
          type="button"
          role="option"
          aria-selected={index === menu.highlighted}
          className="memo-tag-autocomplete-option"
          onMouseDown={(event) => {
            event.preventDefault();
            accept(tag);
          }}
          onMouseEnter={() => setMenu((current) => (current ? { ...current, highlighted: index } : current))}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

function caretRect(): { top: number; left: number; bottom: number } {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    if (rect.height !== 0 || rect.width !== 0) return { top: rect.top, left: rect.left, bottom: rect.bottom };
  }
  return { top: 0, left: 0, bottom: 0 };
}

const sameOptions = (a: string[], b: string[]): boolean => a.length === b.length && a.every((tag, index) => tag === b[index]);
