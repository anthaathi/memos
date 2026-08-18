import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { Klass, LexicalNode } from "lexical";
import { HorizontalRuleNode } from "./nodes/HorizontalRuleNode";
import { MarkdownImageNode } from "./nodes/MarkdownImageNode";
import { MentionNode } from "./nodes/MentionNode";
import { RawMarkdownNode } from "./nodes/RawMarkdownNode";
import { TagNode } from "./nodes/TagNode";
import { UploadAnchorNode } from "./nodes/UploadAnchorNode";

/** Every node class the memo editor can hold. */
export const MEMO_EDITOR_NODES: Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  CodeNode,
  ListNode,
  ListItemNode,
  LinkNode,
  RawMarkdownNode,
  MarkdownImageNode,
  UploadAnchorNode,
  HorizontalRuleNode,
  TagNode,
  MentionNode,
];
