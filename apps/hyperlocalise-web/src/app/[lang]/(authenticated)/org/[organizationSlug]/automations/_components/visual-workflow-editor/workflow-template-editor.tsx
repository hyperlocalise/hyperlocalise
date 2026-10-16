/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Extension, Node, nodeInputRule, nodePasteRule } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/primitives/cn";
import {
  FIELD_REFERENCE_NODE,
  documentToTemplate,
  templateToDocument,
} from "@/lib/visual-workflows/editor/visual-workflow-template-document";
import {
  fieldReference,
  type UpstreamField,
} from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";

/** How a field reference reads as a pill. */
export type FieldReferenceDescription = {
  /** The step the field comes from, or null for an expression the editor does not know. */
  step: string | null;
  field: string;
  /** The full text for the tooltip and for screen readers. */
  title: string;
  /** The step to mark on the canvas while the pointer is on the pill. */
  nodeId: string | null;
  /** The field cannot be read here: its step is gone or does not run before this one. */
  broken: boolean;
};

export type WorkflowTemplateEditorHandle = {
  /** Puts a field at the caret, or at the end when the editor has not had focus. */
  insert: (field: UpstreamField) => void;
  focus: () => void;
};

type PillContext = {
  describe: (raw: string) => FieldReferenceDescription;
  onPoint?: (nodeId: string | null) => void;
};

const FieldReferencePillContext = createContext<PillContext | null>(null);

function FieldReferencePill({ node, selected }: ReactNodeViewProps) {
  const context = useContext(FieldReferencePillContext);
  const raw = typeof node.attrs.raw === "string" ? node.attrs.raw : "";
  const description = context?.describe(raw);
  return (
    <NodeViewWrapper
      as="span"
      data-slot="field-pill"
      data-broken={description?.broken || undefined}
      title={description?.title ?? raw}
      aria-label={description?.title ?? raw}
      onMouseEnter={() => context?.onPoint?.(description?.nodeId ?? null)}
      onMouseLeave={() => context?.onPoint?.(null)}
      // The wrapper sets `white-space: normal` itself; a pill never wraps.
      style={{ whiteSpace: "nowrap" }}
      // 20px tall with 2px margins fills the 24px line exactly, so the pill sits in its middle.
      // The selection ring is drawn inside: a one-line box clips anything outside the line.
      className={cn(
        "mx-px my-0.5 inline-flex h-5 max-w-full cursor-default items-center gap-1 rounded-md border px-1.5 align-top text-xs leading-none font-medium select-none",
        description?.broken
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/25 bg-primary/10 text-primary",
        selected && "ring-2 ring-ring/60 ring-inset",
      )}
    >
      {description?.step ? (
        <>
          <span className="max-w-32 truncate opacity-70">{description.step}</span>
          <span aria-hidden className="opacity-50">
            ›
          </span>
        </>
      ) : null}
      <span className="truncate">{description?.field ?? raw}</span>
    </NodeViewWrapper>
  );
}

/** A field an earlier step gives, read inside the text and shown as one pill. */
const FieldReference = Node.create({
  name: FIELD_REFERENCE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { raw: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-field-reference]",
        getAttrs: (element) => ({ raw: element.getAttribute("data-field-reference") ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["span", { "data-field-reference": node.attrs.raw }, node.attrs.raw];
  },

  renderText({ node }) {
    return typeof node.attrs.raw === "string" ? node.attrs.raw : "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(FieldReferencePill, { as: "span" });
  },

  // Browsers differ on deleting an uneditable span, so the pill beside the caret goes in one key.
  addKeyboardShortcuts() {
    const remove = (side: "before" | "after") => () => {
      const { selection } = this.editor.state;
      if (!selection.empty) return false;
      const { $from } = selection;
      const node = side === "before" ? $from.nodeBefore : $from.nodeAfter;
      if (node?.type !== this.type) return false;
      const from = side === "before" ? $from.pos - node.nodeSize : $from.pos;
      return this.editor.commands.deleteRange({ from, to: from + node.nodeSize });
    };
    return { Backspace: remove("before"), Delete: remove("after") };
  },

  // A reference typed out in full, or pasted, becomes a pill once its braces close.
  addInputRules() {
    return [
      nodeInputRule({
        find: /\{\{[^{}]+\}\}$/,
        type: this.type,
        getAttributes: (match) => ({ raw: match[0] }),
      }),
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: /\{\{[^{}]+\}\}/g,
        type: this.type,
        getAttributes: (match) => ({ raw: match[0] }),
      }),
    ];
  },
});

type FieldMenu = {
  items: UpstreamField[];
  command: (field: UpstreamField) => void;
  element: HTMLElement;
  unmount: () => void;
};

type FieldMenuHandlers = {
  items: (query: string) => UpstreamField[];
  open: (props: SuggestionProps<UpstreamField, UpstreamField>) => void;
  update: (props: SuggestionProps<UpstreamField, UpstreamField>) => void;
  keyDown: (event: KeyboardEvent) => boolean;
  close: () => void;
};

/** Typing `{{` lists the fields of earlier steps at the caret; picking one puts in its pill. */
function fieldMenuExtension(handlers: { current: FieldMenuHandlers }) {
  return Extension.create({
    name: "fieldMenu",
    // Ahead of the one-line rule, so Enter picks a field while the list is open.
    priority: 1000,
    addProseMirrorPlugins() {
      return [
        Suggestion<UpstreamField, UpstreamField>({
          editor: this.editor,
          pluginKey: new PluginKey("workflowFieldMenu"),
          char: "{{",
          allowedPrefixes: null,
          floatingUi: { strategy: "fixed" },
          items: ({ query }) => handlers.current.items(query),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, {
                type: FIELD_REFERENCE_NODE,
                attrs: { raw: fieldReference(props) },
              })
              .run();
          },
          render: () => ({
            onStart: (props) => handlers.current.open(props),
            onUpdate: (props) => handlers.current.update(props),
            onKeyDown: ({ event }) => handlers.current.keyDown(event),
            onExit: () => handlers.current.close(),
          }),
        }),
      ];
    },
  });
}

/**
 * Hands undo and redo to the page's own undo stack, which listens for the browser's undo input
 * on its root, so typing here undoes with the rest of the workflow.
 */
const PageUndo = Extension.create({
  name: "pageUndo",
  addKeyboardShortcuts() {
    const send = (inputType: "historyUndo" | "historyRedo") => () => {
      this.editor.view.dom.dispatchEvent(
        new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }),
      );
      return true;
    };
    return {
      "Mod-z": send("historyUndo"),
      "Mod-Shift-z": send("historyRedo"),
      "Mod-y": send("historyRedo"),
    };
  },
});

/** A one-line setting keeps to one line: Enter does nothing. */
const SingleLine = Extension.create({
  name: "singleLine",
  addKeyboardShortcuts() {
    return { Enter: () => true, "Shift-Enter": () => true, "Mod-Enter": () => true };
  },
});

function matchesQuery(field: UpstreamField, stepTitle: string, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${stepTitle} ${field.path}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

const MENU_LIMIT = 50;

/**
 * The text of a workflow step's setting, with the fields of earlier steps it reads shown as pills
 * while it is edited. The value stays the plain text the run reads, `{{ nodes.<id>.<path> }}`.
 */
export function WorkflowTemplateEditor({
  ref,
  id,
  labelId,
  value,
  onChange,
  placeholder,
  invalid = false,
  multiline = false,
  fields,
  stepTitle,
  describeReference,
  onPoint,
  renderField,
  emptyLabel,
  className,
}: {
  ref?: Ref<WorkflowTemplateEditorHandle>;
  id: string;
  labelId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  multiline?: boolean;
  /** The fields `{{` offers; none turns the menu off. */
  fields: readonly UpstreamField[];
  stepTitle: (nodeId: string) => string;
  describeReference: (raw: string) => FieldReferenceDescription;
  onPoint?: (nodeId: string | null) => void;
  renderField: (field: UpstreamField) => ReactNode;
  emptyLabel: string;
  className?: string;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  // Until the text has had focus, a field from the Insert menu goes at its end.
  const focusedRef = useRef(false);

  const [menu, setMenu] = useState<FieldMenu | null>(null);
  const [active, setActive] = useState(0);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const activeRef = useRef(active);
  activeRef.current = active;

  const handlers = useRef<FieldMenuHandlers>(null as unknown as FieldMenuHandlers);
  handlers.current = {
    items: (query) =>
      fields
        .filter((field) => matchesQuery(field, stepTitle(field.nodeId), query))
        .slice(0, MENU_LIMIT),
    open: (props) => {
      const element = document.createElement("div");
      element.style.zIndex = "100";
      const unmount = props.mount(element);
      setActive(0);
      setMenu({ items: props.items, command: props.command, element, unmount });
    },
    update: (props) => {
      setActive(0);
      setMenu((current) =>
        current ? { ...current, items: props.items, command: props.command } : current,
      );
    },
    keyDown: (event) => {
      const current = menuRef.current;
      if (!current || event.key === "Escape") return false;
      const count = current.items.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (count > 0) {
          const step = event.key === "ArrowDown" ? 1 : count - 1;
          setActive((index) => (index + step) % count);
        }
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const field = current.items[activeRef.current];
        if (!field) return false;
        current.command(field);
        return true;
      }
      return false;
    },
    close: () => {
      const current = menuRef.current;
      current?.unmount();
      setMenu(null);
    },
  };
  useEffect(() => () => menuRef.current?.unmount(), []);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
        undoRedo: false,
      }),
      Placeholder.configure({ placeholder: () => placeholderRef.current ?? "" }),
      FieldReference,
      fieldMenuExtension(handlers),
      PageUndo,
      ...(multiline ? [] : [SingleLine]),
    ],
    coreExtensionOptions: { clipboardTextSerializer: { blockSeparator: "\n" } },
    content: templateToDocument(value, { multiline }),
    editorProps: {
      attributes: editorAttributes({ id, labelId, invalid, multiline }),
      transformPastedText: (text) => (multiline ? text : text.replace(/\r?\n/g, " ")),
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(documentToTemplate(current.state.doc));
    },
  });

  // A change from outside, such as an undo, replaces the text unless it already reads the same.
  // Deferred, since drawing the pills renders React while this commit is still running.
  useEffect(() => {
    queueMicrotask(() => {
      if (!editor || editor.isDestroyed) return;
      if (documentToTemplate(editor.state.doc) === value) return;
      editor.commands.setContent(templateToDocument(value, { multiline }), { emitUpdate: false });
    });
  }, [editor, value, multiline]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: editorAttributes({ id, labelId, invalid, multiline }),
      },
    });
  }, [editor, id, labelId, invalid, multiline]);

  useImperativeHandle(
    ref,
    () => ({
      insert: (field) => {
        if (!editor) return;
        const node = { type: FIELD_REFERENCE_NODE, attrs: { raw: fieldReference(field) } };
        editor
          .chain()
          .focus(focusedRef.current ? undefined : "end")
          .insertContent(node)
          .run();
      },
      focus: () => editor?.commands.focus("end"),
    }),
    [editor],
  );

  const groups = menu
    ? [...new Set(menu.items.map((field) => field.nodeId))].map((nodeId) => ({
        nodeId,
        title: stepTitle(nodeId),
        items: menu.items.flatMap((field, index) =>
          field.nodeId === nodeId ? [{ field, index }] : [],
        ),
      }))
    : [];

  return (
    <FieldReferencePillContext value={{ describe: describeReference, onPoint }}>
      <EditorContent
        editor={editor}
        data-slot="template-editor"
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base transition-colors md:text-sm",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          "has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive/20",
          "[&_.tiptap]:outline-none [&_.tiptap_p]:leading-6",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          multiline
            ? "min-h-16 py-2 [&_.tiptap]:min-h-11 [&_.tiptap]:whitespace-pre-wrap"
            : "py-1.5 [&_.tiptap]:overflow-x-auto [&_.tiptap]:whitespace-pre [&_.tiptap]:[scrollbar-width:none]",
          className,
        )}
      />
      {menu && fields.length > 0
        ? createPortal(
            <div
              role="listbox"
              id={`${id}-fields`}
              data-slot="field-menu"
              className="max-h-72 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {groups.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyLabel}</p>
              ) : (
                groups.map((group) => (
                  <div key={group.nodeId} role="group" aria-label={group.title}>
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {group.title}
                    </p>
                    {group.items.map(({ field, index }) => (
                      <div
                        key={`${field.nodeId}.${field.path}`}
                        role="option"
                        aria-selected={index === active}
                        className={cn(
                          "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                          index === active && "bg-accent text-accent-foreground",
                        )}
                        onMouseEnter={() => {
                          setActive(index);
                          onPoint?.(field.nodeId);
                        }}
                        onMouseLeave={() => onPoint?.(null)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => menu.command(field)}
                      >
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>,
            menu.element,
          )
        : null}
    </FieldReferencePillContext>
  );
}

function editorAttributes({
  id,
  labelId,
  invalid,
  multiline,
}: {
  id: string;
  labelId: string;
  invalid: boolean;
  multiline: boolean;
}): Record<string, string> {
  return {
    id,
    role: "textbox",
    "aria-labelledby": labelId,
    "aria-multiline": String(multiline),
    ...(invalid ? { "aria-invalid": "true" } : {}),
  };
}
