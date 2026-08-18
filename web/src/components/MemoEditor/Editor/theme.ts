import type { EditorThemeClasses } from "lexical";

/**
 * Lexical theme: node types map to the stable class names styled in
 * `Editor/editor.css` (the `.memo-editor-content` block), so the editor is
 * themed with the app's CSS custom properties like the rest of the UI.
 */
export const memoEditorTheme: EditorThemeClasses = {
  root: "memo-editor-root",
  paragraph: "memo-editor-paragraph",
  heading: {
    h1: "memo-editor-heading memo-editor-heading-1",
    h2: "memo-editor-heading memo-editor-heading-2",
    h3: "memo-editor-heading memo-editor-heading-3",
    h4: "memo-editor-heading memo-editor-heading-4",
    h5: "memo-editor-heading memo-editor-heading-5",
    h6: "memo-editor-heading memo-editor-heading-6",
  },
  text: {
    bold: "memo-editor-text-bold",
    italic: "memo-editor-text-italic",
    strikethrough: "memo-editor-text-strike",
    code: "memo-editor-text-code",
    underline: "memo-editor-text-underline",
  },
  quote: "memo-editor-quote",
  list: {
    ul: "memo-editor-list-ul",
    ol: "memo-editor-list-ol",
    checklist: "memo-editor-list-checklist",
    listitem: "memo-editor-list-item",
    listitemChecked: "memo-editor-list-item-checked",
    listitemUnchecked: "memo-editor-list-item-unchecked",
    nested: {
      list: "memo-editor-nested-list",
      listitem: "memo-editor-nested-list-item",
    },
  },
  code: "memo-editor-code",
  hr: "memo-editor-hr",
  image: "memo-editor-image",
  link: "memo-editor-link",
};
