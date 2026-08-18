import { $isCodeNode } from "@lexical/code";
import { $isLinkNode } from "@lexical/link";
import { $createTextNode, type LexicalEditor, type LexicalNode, TextNode } from "lexical";
import { findMentionMatches } from "@/utils/mention-grammar";
import { findTagMatches } from "@/utils/tag-grammar";
import { isUsernameCharacter } from "@/utils/username";
import { $createMentionNode, $isMentionNode, MentionNode } from "./nodes/MentionNode";
import { $isRawMarkdownNode } from "./nodes/RawMarkdownNode";
import { $createTagNode, $isTagNode, TagNode } from "./nodes/TagNode";

/**
 * In-place `#tag` / `@mention` highlighting. The decorated-source editor
 * computed these spans from the Markdown syntax tree; in the rich-text editor
 * the same grammars run per text node, and opaque Markdown contexts become
 * structural: inline-code text, code blocks, link labels, and raw Markdown
 * blocks are skipped.
 */

/** Contexts whose text is Markdown source, not prose. */
function isOpaqueContext(node: TextNode): boolean {
  if (node.hasFormat("code")) return true;
  for (let ancestor: LexicalNode | null = node.getParent(); ancestor; ancestor = ancestor.getParent()) {
    if ($isCodeNode(ancestor) || $isLinkNode(ancestor) || $isRawMarkdownNode(ancestor)) return true;
  }
  return false;
}

/** Whether the text immediately before `node` continues a username run. */
function mentionHasLeftBoundary(node: TextNode): boolean {
  const previous = node.getPreviousSibling();
  if (!previous) return true;
  const text = previous.getTextContent();
  const last = text[text.length - 1];
  return last === undefined ? true : !isUsernameCharacter(last);
}

interface Span {
  from: number;
  to: number;
  kind: "tag" | "mention";
}

function spansIn(node: TextNode): Span[] {
  const text = node.getTextContent();
  const spans: Span[] = [
    ...findTagMatches(text).map((match) => ({ from: match.from, to: match.to, kind: "tag" as const })),
    ...findMentionMatches(text, mentionHasLeftBoundary(node)).map((match) => ({
      from: match.from,
      to: match.to,
      kind: "mention" as const,
    })),
  ];
  spans.sort((a, b) => a.from - b.from || a.to - b.to);
  return spans;
}

function wrapSpans(node: TextNode): void {
  const text = node.getTextContent();
  const format = node.getFormat();
  // Keep the longest span starting at each position (tags win ties by sort).
  const spans: Span[] = [];
  for (const span of spansIn(node)) {
    const previous = spans[spans.length - 1];
    if (previous && span.from < previous.to) continue; // overlap
    spans.push(span);
  }
  if (spans.length === 0) return;

  const parts: TextNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor) parts.push($createTextNode(text.slice(cursor, span.from)).setFormat(format));
    const styled =
      span.kind === "tag" ? $createTagNode(text.slice(span.from, span.to)) : $createMentionNode(text.slice(span.from, span.to));
    parts.push(styled.setFormat(format));
    cursor = span.to;
  }
  if (cursor < text.length) parts.push($createTextNode(text.slice(cursor)).setFormat(format));
  // Lexical's replace() is single-node; chain the pieces.
  node.replace(parts[0]!);
  let cursor2 = parts[0]!;
  for (let index = 1; index < parts.length; index++) {
    cursor2.insertAfter(parts[index]!);
    cursor2 = parts[index]!;
  }
}

/** Demote styled nodes whose text stopped being a tag/mention. */
function unwrapIfInvalid(node: TagNode | MentionNode): void {
  const text = node.getTextContent();
  // A styled node is its own run: the span must cover the whole text starting
  // at 0 (mentions validate with a left boundary since the node starts it).
  const valid =
    node instanceof TagNode
      ? findTagMatches(text).some((match) => match.from === 0 && match.to === text.length)
      : findMentionMatches(text, true).some((match) => match.from === 0 && match.to === text.length);
  if (!valid) node.replace($createTextNode(text).setFormat(node.getFormat()));
}

export function registerTagMentionStyling(editor: LexicalEditor): () => void {
  const unregisterPlainText = editor.registerNodeTransform(TextNode, (node) => {
    if ($isTagNode(node) || $isMentionNode(node)) return;
    if (isOpaqueContext(node)) return;
    if (spansIn(node).length === 0) return;
    wrapSpans(node);
  });
  const unregisterTag = editor.registerNodeTransform(TagNode, unwrapIfInvalid);
  const unregisterMention = editor.registerNodeTransform(MentionNode, unwrapIfInvalid);
  return () => {
    unregisterPlainText();
    unregisterTag();
    unregisterMention();
  };
}
