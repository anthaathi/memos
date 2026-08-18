import { $isListItemNode, $isListNode, type ListNode } from "@lexical/list";
import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  CHECK_LIST,
  CODE,
  type ElementTransformer,
  HEADING,
  LINK,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  type TextMatchTransformer,
  type Transformer,
  UNORDERED_LIST,
} from "@lexical/markdown";
import type { BaseSelection, EditorState, ElementNode, LexicalNode } from "lexical";
import { $createHorizontalRuleNode, $isHorizontalRuleNode, HorizontalRuleNode } from "./nodes/HorizontalRuleNode";
import { $createMarkdownImageNode, $isMarkdownImageNode, MarkdownImageNode } from "./nodes/MarkdownImageNode";
import { $createRawMarkdownNodeWithText, $isRawMarkdownNode, RawMarkdownNode } from "./nodes/RawMarkdownNode";

/**
 * Markdown ⇄ Lexical for the memo editor. Markdown stays the storage format:
 * import parses it into rich nodes (with verbatim raw blocks for constructs the
 * editor has no node for), export serializes the tree back out. The pair is
 * tuned for how memos render (remark-gfm + remark-breaks):
 *
 * - single newlines inside a paragraph stay line breaks (not merged, not split
 *   into paragraphs), and hard-break "  " suffixes survive byte-for-byte;
 * - lists keep their nesting: the importer normalizes CommonMark content-column
 *   indentation to Lexical's 4-space levels, and the exporter re-emits
 *   content-column indentation so remark nests what the editor nested.
 */

// ---------------------------------------------------------------------------
// Custom transformers
// ---------------------------------------------------------------------------

/** A regex that cannot match any string; RAW_MARKDOWN is export-only. */
const NEVER_MATCHES = /(?!)raw-markdown-placeholder/;

const RAW_MARKDOWN: ElementTransformer = {
  dependencies: [RawMarkdownNode],
  export: (node) => ($isRawMarkdownNode(node) ? node.getMarkdown() : null),
  regExp: NEVER_MATCHES,
  replace: () => {},
  type: "element",
};

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(?:---|\*\*\*|___)\s*$/,
  replace: (parentNode, _children, _match, isImport) => {
    const node = $createHorizontalRuleNode();
    parentNode.replace(node, !isImport);
  },
  type: "element",
};

const IMAGE: TextMatchTransformer = {
  dependencies: [MarkdownImageNode],
  export: (node) => ($isMarkdownImageNode(node) ? node.toMarkdown() : null),
  importRegExp: /!\[([^\]]*)\]\(([^()\s]+)(?:\s+"((?:[^"]*\\")*[^"]*)")?\)/,
  regExp: /!\[([^\]]*)\]\(([^()\s]+)(?:\s+"((?:[^"]*\\")*[^"]*)")?\)$/,
  replace: (textNode, match) => {
    const [, alt, src, title] = match;
    textNode.replace($createMarkdownImageNode({ alt: alt ?? "", src: src ?? "", title: title || undefined }));
  },
  trigger: ")",
  type: "text-match",
};

// ---------------------------------------------------------------------------
// List export: content-column indentation
// ---------------------------------------------------------------------------

/** Indent step for children of each list type (CommonMark content column). */
const CHILD_INDENT_STEP = { bullet: 4, number: 4, check: 6 } as const;

function $memoListExport(
  listNode: ListNode,
  exportChildren: (node: ElementNode) => string,
  indent: number,
  selection?: BaseSelection | null | undefined,
): string {
  const output: string[] = [];
  const children = listNode.getChildren();
  const listType = listNode.getListType();
  const childIndent = indent + CHILD_INDENT_STEP[listType];
  let index = 0;
  for (const listItemNode of children) {
    if (!$isListItemNode(listItemNode)) continue;
    // A list nested in an item of its own recurses at the parent item's
    // content column (this is how imported nesting is represented).
    if (listItemNode.getChildrenSize() === 1) {
      const firstChild = listItemNode.getFirstChild();
      if ($isListNode(firstChild)) {
        const nested = $memoListExport(firstChild, exportChildren, childIndent, selection);
        if (nested) output.push(nested);
        continue;
      }
    }
    if (selection && !listItemNode.getChildren().some((child) => child.isSelected(selection))) continue;
    const prefix =
      listType === "number"
        ? `${listNode.getStart() + index}. `
        : listType === "check"
          ? `- [${listItemNode.getChecked() ? "x" : " "}] `
          : "- ";
    let childrenText = exportChildren(listItemNode);
    // Keep an accidental ordered-marker start in a bullet/check item literal.
    if (listType !== "number") childrenText = childrenText.replace(/^(\s{0,3}\d+)(\.\s)/, "$1\\$2");
    output.push(`${" ".repeat(indent)}${prefix}${childrenText}`);
    index += 1;
  }
  return output.join("\n");
}

const listExport = (transformer: ElementTransformer): ElementTransformer => ({
  ...transformer,
  export: (node, exportChildren, selection) => ($isListNode(node) ? $memoListExport(node, exportChildren, 0, selection) : null),
});

const MEMO_CHECK_LIST = listExport(CHECK_LIST);
const MEMO_UNORDERED_LIST = listExport(UNORDERED_LIST);
const MEMO_ORDERED_LIST = listExport(ORDERED_LIST);

/**
 * The memo editor's transformer set. Order matters for import: check lists must
 * outrank plain bullets, and the image match must precede links.
 */
export const MEMO_TRANSFORMERS: Transformer[] = [
  HEADING,
  HORIZONTAL_RULE,
  MEMO_CHECK_LIST,
  MEMO_UNORDERED_LIST,
  MEMO_ORDERED_LIST,
  QUOTE,
  RAW_MARKDOWN,
  CODE,
  ...TEXT_FORMAT_TRANSFORMERS,
  IMAGE,
  LINK,
];

// ---------------------------------------------------------------------------
// Import: raw-block segmentation + list indentation normalization
// ---------------------------------------------------------------------------

interface MarkdownSegment {
  /** Verbatim source of the segment. */
  text: string;
  /** Raw segments become a RawMarkdownNode; rich segments go through Lexical. */
  raw: boolean;
}

const FENCE_START = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_END = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const TABLE_LINE = /^ {0,3}\|/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const MATH_START = /^\s*\$\$/;
const MATH_END = /\$\$\s*$/;
const HTML_START = /^ {0,3}<[/!?]?[a-zA-Z]/;

/**
 * Split a document into rich and raw segments. Raw = pipe tables, `$$` math
 * blocks, and block HTML — constructs with no dedicated Lexical node that must
 * survive editing byte-for-byte. Fenced code stays rich: the CODE transformer
 * models it natively.
 */
export function segmentMarkdown(markdown: string): MarkdownSegment[] {
  const lines = markdown.split("\n");
  const segments: MarkdownSegment[] = [];
  let rich: string[] = [];
  let fence: { marker: string; length: number } | null = null;

  const flushRich = () => {
    // Blank edges between segments are paragraph separators, not content.
    while (rich.length > 0 && rich[0].trim() === "") rich.shift();
    while (rich.length > 0 && rich[rich.length - 1].trim() === "") rich.pop();
    if (rich.length > 0) segments.push({ text: rich.join("\n"), raw: false });
    rich = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      const close = FENCE_END.exec(line);
      if (close && close[1]!.startsWith(fence.marker) && close[1]!.length >= fence.length) fence = null;
      rich.push(line);
      continue;
    }
    const open = FENCE_START.exec(line);
    if (open) {
      fence = { marker: open[1]![0]!, length: open[1]!.length };
      rich.push(line);
      continue;
    }
    if (TABLE_LINE.test(line) && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1]!)) {
      flushRich();
      const raw: string[] = [line, lines[i + 1]!]; // header + delimiter row
      i += 1;
      while (i + 1 < lines.length && TABLE_LINE.test(lines[i + 1]!)) {
        i += 1;
        raw.push(lines[i]!);
      }
      segments.push({ text: raw.join("\n"), raw: true });
      continue;
    }
    if (MATH_START.test(line)) {
      const trimmed = line.trim();
      // A closing "$$" on the same line is inline math — plain rich text.
      const sameLineClose = trimmed.indexOf("$$", 2) >= 0;
      if (sameLineClose) {
        rich.push(line);
        continue;
      }
      flushRich();
      const raw: string[] = [line];
      // A flow block runs until a closing delimiter line or the end of input
      // (an unterminated block stays raw so it can never be mangled).
      while (i + 1 < lines.length && !MATH_END.test(lines[i + 1]!)) {
        i += 1;
        raw.push(lines[i]!);
      }
      if (i + 1 < lines.length) {
        i += 1;
        raw.push(lines[i]!);
      }
      segments.push({ text: raw.join("\n"), raw: true });
      continue;
    }
    if (HTML_START.test(line)) {
      flushRich();
      const raw: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1]!.trim() !== "") {
        i += 1;
        raw.push(lines[i]!);
      }
      segments.push({ text: raw.join("\n"), raw: true });
      continue;
    }
    rich.push(line);
  }
  flushRich();
  return segments;
}

const LIST_MARKER = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const TASK_MARKER = /^\[[ xX]\]\s/;
const markerWidth = (marker: string, gap: string): number => marker.length + gap.length;
const indentWidth = (whitespace: string): number => whitespace.replace(/\t/g, "    ").length;

/**
 * Re-indent list markers from CommonMark's content-column nesting to Lexical's
 * 4-space levels. The previous editor nested bullets at 2 spaces and ordered
 * items at 3 (the CommonMark minimum); Lexical's importer only recognizes
 * nesting at multiples of 4, so without this pass editing a memo with compact
 * nesting would flatten it.
 */
export function normalizeListIndentation(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  /** Content column of each open ancestor list item. */
  const stack: number[] = [];
  let fence: { marker: string; length: number } | null = null;

  for (const line of lines) {
    if (fence) {
      const close = FENCE_END.exec(line);
      if (close && close[1]!.startsWith(fence.marker) && close[1]!.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    const open = FENCE_START.exec(line);
    if (open) {
      fence = { marker: open[1]![0]!, length: open[1]!.length };
      out.push(line);
      continue;
    }

    const match = LIST_MARKER.exec(line);
    if (!match) {
      // Blank lines and lazy continuations do not close the list context; the
      // stack only shrinks when a shallower marker line appears.
      out.push(line);
      continue;
    }
    const [, whitespace, marker, gap, content] = match;
    const width = indentWidth(whitespace);
    while (stack.length > 0 && stack[stack.length - 1]! > width) stack.pop();
    const depth = stack.length;
    const normalizedIndent = " ".repeat(depth * 4);
    out.push(`${normalizedIndent}${marker}${gap}${content}`);
    const widthAfter = markerWidth(marker, gap) + (TASK_MARKER.test(content) ? 4 : 0);
    stack.push(depth * 4 + widthAfter);
  }
  return out.join("\n");
}

/** Parse a markdown document into Lexical nodes (raw segments kept verbatim). */
export function markdownToNodes(markdown: string): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (const segment of segmentMarkdown(markdown)) {
    if (segment.raw) {
      nodes.push($createRawMarkdownNodeWithText(segment.text));
    } else {
      nodes.push(...$generateNodesFromMarkdownString(normalizeListIndentation(segment.text), MEMO_TRANSFORMERS));
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const exportCache = new WeakMap<EditorState, string>();

/** Serialize the current editor state to markdown (cached per state). */
export function stateToMarkdown(editorState: EditorState): string {
  const cached = exportCache.get(editorState);
  if (cached !== undefined) return cached;
  const markdown = editorState.read(() => $convertToMarkdownString(MEMO_TRANSFORMERS));
  // Collapse blank runs (upload chips export as empty blocks; remark renders
  // any run of blank lines as a single paragraph break either way).
  const normalized = markdown.replace(/\n{3,}/g, "\n\n");
  exportCache.set(editorState, normalized);
  return normalized;
}
