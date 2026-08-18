# MemoEditor Architecture

## Overview

MemoEditor is a three-layer component. At its core is a single editor — `Editor/`, a Lexical rich-text editor. The memo stays **markdown** end to end: `setMarkdown` parses it into the editor's node tree, every change serializes the tree back to markdown, and `state.content` holds exactly that string. Constructs the editor has no rich node for (pipe tables, `$$` math blocks, block HTML) are preserved **verbatim** inside raw-markdown blocks, so editing a memo never rewrites them. Everything above the editor boundary talks markdown through the `EditorController` contract.

## Architecture

```
┌─────────────────────────────────────────┐
│   Presentation Layer (Components)       │
│   - EditorToolbar, EditorContent, etc.  │
└─────────────────┬───────────────────────┘
                  │ EditorController
┌─────────────────▼───────────────────────┐
│   State Layer (Reducer + Context)       │
│   - state/, useEditorContext()          │
│   - state.content  ← markdown (the      │
│     single source of truth)             │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Service Layer (Business Logic)        │
│   - services/ (pure functions)          │
└─────────────────────────────────────────┘
```

## Directory Structure

```
MemoEditor/
├── state/                  # State management (reducer, actions, context)
├── services/               # Business logic (pure functions)
├── components/             # UI components
│   ├── EditorContent.tsx   # Hosts Editor; forwards its EditorController ref
│   ├── EditorToolbar.tsx   # Toolbar
│   └── ...
├── hooks/                  # React hooks (utilities)
│   ├── useMemoSave.ts      # Save transaction, cache invalidation, and reset
│   └── useFocusMode.ts     # Scroll lock and layout-stable focus presentation
├── Editor/                 # The Lexical rich-text editor
│   ├── index.tsx           # React shell: LexicalComposer, plugin wiring,
│   │                       #   external-content sync, IME deferral, controller ref
│   ├── markdown.ts         # Markdown ⇄ Lexical: transformer set, raw-block
│   │                       #   segmentation, list-indent normalization, export cache
│   ├── controller.ts       # EditorController impl over a Lexical editor
│   ├── formatting.ts       # FormattingController impl (catalog verbs → commands)
│   ├── plugins.tsx         # Behavior registrations: rich text, lists, checklists,
│   │                       #   history, markdown shortcuts, file paste/drop,
│   │                       #   Cmd/Ctrl+Enter submit, Tab nesting, Escape blur
│   ├── tagStyling.ts       # #tag/@mention in-place highlighting transforms
│   ├── tagAutocomplete.tsx # #tag typeahead menu + pure ranking grammar
│   ├── theme.ts            # Lexical theme class map (CSS-var styled in editor.css)
│   ├── nodes.ts            # Node registry for the composer
│   └── nodes/              # Custom nodes: RawMarkdown, MarkdownImage,
│                           #   UploadAnchor, Tag, Mention
├── formatting/
│   └── commands.ts         # Backend-agnostic catalog of formatting verbs
├── Toolbar/                # Toolbar sub-components (InsertMenu, VisibilitySelector)
├── constants.ts
└── types/
    ├── editorController.ts # EditorController / FormattingController interfaces
    └── uploadAnchor.ts     # UploadAnchorDescriptor (editor-agnostic)
```

## Key Concepts

### State Management

Uses `useReducer` + Context for predictable state transitions. All state changes go through action creators.

`state.content` holds the document as a **markdown string** and is the single source of truth. The editor serializes into it on every change (see `Editor/markdown.ts` for the round-trip rules); applying external content (`setMarkdown`) parses the string back into the editor.

### The editor contract

`types/editorController.ts` defines `EditorController` — `focus`, `hasFocus`, `isEmpty`, `getMarkdown`, `setMarkdown`, `insertMarkdown`, upload-anchor lifecycle, `getCursor`/`setCursor`, `scrollToCursor`, `selectAll`, plus a `formatting` capability. Callers outside the editor implementation use this interface exclusively and never reach into Lexical internals.

`Editor/controller.ts` implements it over a `LexicalEditor`. `getMarkdown` serializes the current editor state (cached per state); `setMarkdown` replaces the whole tree; `insertMarkdown` splits the caret's block so the new markdown lands as its own block without consuming the selection. Cursor offsets are plain-text projection offsets (blocks joined by newlines), good enough to restore a draft caret.

### The markdown round-trip (`Editor/markdown.ts`)

- Import: the document is first segmented — pipe tables, `$$` math blocks, and block HTML become `RawMarkdownNode` blocks that keep their source verbatim; everything else parses through Lexical's markdown transformers (plus custom image, horizontal-rule, and checklist transformers). Single newlines stay line breaks (matching `remark-breaks` rendering), and compact list nesting (2/3-space, as written by the previous editor) is normalized to Lexical's 4-space levels on the way in.
- Export: the tree serializes back with the same transformers; lists re-indent to CommonMark content columns so rendered nesting matches the editor's; raw blocks emit their source byte-for-byte. Escaping of emphasis characters is Lexical's (stable across re-imports).
- Known limitation: nesting a list of a *different* type under a checklist or ordered item (e.g. a bullet under `- [ ]`) is restructured by Lexical's list transforms; the round-trip keeps it renderable (loose list) but may rewrite the spacing.

### The formatting catalog

`formatting/commands.ts` is the single, editor-agnostic catalog of formatting verbs (`EDITOR_COMMANDS`, `EditorCommandId`, `ActiveFormatState`, `isCommandActive`). It is metadata only — labels (i18n keys), icons, and grouping — with no dependency on any concrete editor. The toolbar and the active-state highlighting derive everything from this catalog; `Editor/formatting.ts` supplies how each verb is applied to the live Lexical document. To add a verb, add one entry here (and its field on `ActiveFormatState`).

### The editor shell

`Editor/plugins.tsx` registers the editor's behavior: rich-text and list handling (checklists render as checkboxes), undo history, markdown shortcuts while typing (`# `, `- `, `> `, fences, `**`), the `#tag`/`@mention` styling transforms, file paste/drop interception (files go to the attachment layer; text paste remains editor-owned), the Cmd/Ctrl+Enter save shortcut, Tab/Shift-Tab list nesting (two-space indent elsewhere), and Escape-to-blur. `Editor/index.tsx` owns the React shell: it seeds content once, applies external content when `contentIsExternal` (deferring through IME compositions), exposes the controller ref, and renders the placeholder.

### Upload anchors

Inline image uploads render a block chip (`nodes/UploadAnchorNode.tsx`) while in flight. The controller maps chips by id: `createUploadAnchor` inserts one at the caret, `updateUploadAnchor` re-renders it with fresh progress/labels, `resolveUploadAnchor` replaces it with the uploaded image markdown, and `cancelUploadAnchor` removes it. Chips never serialize into markdown.

### Lifecycle hooks

Cross-cutting React workflows stay outside the editor shell. `useMemoSave` coordinates validation, persistence, query invalidation, and post-save reducer state. `useFocusMode` owns focus mode's DOM lifecycle, including restoring the editor's place in grid layouts.

### Components

Thin presentation components that dispatch actions and render UI.

## Usage

```typescript
import MemoEditor from "@/components/MemoEditor";

<MemoEditor
  memoName="memos/123"
  onConfirm={(name) => console.log('Saved:', name)}
  onCancel={() => console.log('Cancelled')}
/>
```

## Testing

Services are pure functions — easy to unit test without React. The editor layers have focused suites: `tests/editor-markdown.test.ts` (segmentation + round-trip), `tests/editor-controller.test.ts`, `tests/editor-formatting.test.ts`, `tests/editor-keys.test.tsx`, `tests/editor-tag-*.test.ts`, `tests/editor-upload-anchor.test.tsx`, and `tests/editor.test.tsx` (component shell). The `tests/helpers/` harnesses build a fully-wired editor without mounting React.

```typescript
const state = mockEditorState();
const result = await memoService.save(state, { memoName: 'memos/123' });
```
