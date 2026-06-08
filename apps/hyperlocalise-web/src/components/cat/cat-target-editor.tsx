"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension, type Extensions } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import {
  analyzeCatMessageFormat,
  compareCatMessageFormats,
  missingCatMessageTokens,
  type CatIcuBlockSummary,
  type CatMessageAnalysis,
  type CatMessageToken,
} from "./cat-message-format";

function textDocFromValue(value: string) {
  const lines = value.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

function editorText(editor: NonNullable<ReturnType<typeof useEditor>>) {
  return editor.getText({ blockSeparator: "\n" });
}

function tokenClassName(token: CatMessageToken) {
  switch (token.kind) {
    case "icu":
      return "cat-mf-token cat-mf-icu";
    case "pound":
      return "cat-mf-token cat-mf-pound";
    case "tag":
      return "cat-mf-token cat-mf-tag";
    default:
      return "cat-mf-token cat-mf-placeholder";
  }
}

function decorationRangesForToken(
  textRanges: Array<{ offsetStart: number; offsetEnd: number; posStart: number }>,
  token: CatMessageToken,
) {
  return textRanges.flatMap((range) => {
    const start = Math.max(token.start, range.offsetStart);
    const end = Math.min(token.end, range.offsetEnd);
    if (start >= end) {
      return [];
    }

    return [
      {
        from: range.posStart + (start - range.offsetStart),
        to: range.posStart + (end - range.offsetStart),
      },
    ];
  });
}

function createCatMessageFormatExtension() {
  return Extension.create({
    name: "catMessageFormatDecorations",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("catMessageFormatDecorations"),
          props: {
            decorations(state) {
              const textRanges: Array<{
                offsetStart: number;
                offsetEnd: number;
                posStart: number;
              }> = [];
              let offset = 0;
              let prevNodeEnd = -1;

              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) {
                  return;
                }

                // Account for the "\n" block separator that textBetween inserts
                // between consecutive text nodes that belong to different blocks.
                if (prevNodeEnd !== -1 && pos !== prevNodeEnd) {
                  offset += 1;
                }

                textRanges.push({
                  offsetStart: offset,
                  offsetEnd: offset + node.text.length,
                  posStart: pos,
                });
                offset += node.text.length;
                prevNodeEnd = pos + node.text.length;
              });

              const text = state.doc.textBetween(0, state.doc.content.size, "\n", "\n");
              const analysis = analyzeCatMessageFormat(text);
              const decorations: Decoration[] = [];

              analysis.tokens.forEach((token) => {
                decorationRangesForToken(textRanges, token).forEach(({ from, to }) => {
                  decorations.push(Decoration.inline(from, to, { class: tokenClassName(token) }));
                });
              });

              if (analysis.parseError) {
                decorationRangesForToken(textRanges, {
                  id: "parse-error",
                  kind: "argument",
                  name: "parse-error",
                  literal: "",
                  start: analysis.parseError.start,
                  end: analysis.parseError.end,
                }).forEach(({ from, to }) => {
                  decorations.push(Decoration.inline(from, to, { class: "cat-mf-error" }));
                });
              }

              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

function tokenLabel(token: CatMessageToken) {
  if (token.kind === "icu") {
    return `{${token.name}, ${token.type}}`;
  }

  if (token.kind === "tag") {
    return `<${token.name}>`;
  }

  return token.literal || `{${token.name}}`;
}

function presentTokenSignatures(analysis: CatMessageAnalysis) {
  return new Set(
    analysis.tokens.map((token) =>
      token.kind === "icu"
        ? `${token.kind}:${token.name}:${token.type}:${(token.options ?? []).join("|")}`
        : `${token.kind}:${token.name}`,
    ),
  );
}

export function CatMessagePreview({ message, className }: { message: string; className?: string }) {
  const analysis = useMemo(() => analyzeCatMessageFormat(message), [message]);
  const ranges = analysis.tokens
    .filter((token) => token.kind !== "pound")
    .toSorted((first, second) => first.start - second.start)
    .reduce<CatMessageToken[]>((items, token) => {
      const previous = items.at(-1);
      if (previous && token.start < previous.end) {
        return items;
      }
      return [...items, token];
    }, []);

  if (ranges.length === 0) {
    return <span className={className}>{message}</span>;
  }

  let cursor = 0;
  const parts: Array<{ text: string; token?: CatMessageToken; key: string }> = [];
  ranges.forEach((token) => {
    if (cursor < token.start) {
      parts.push({ key: `text-${cursor}`, text: message.slice(cursor, token.start) });
    }
    parts.push({
      key: token.id,
      text: message.slice(token.start, token.end),
      token,
    });
    cursor = token.end;
  });

  if (cursor < message.length) {
    parts.push({ key: `text-${cursor}`, text: message.slice(cursor) });
  }

  return (
    <span className={className}>
      {parts.map((part) =>
        part.token ? (
          <span
            key={part.key}
            className={cn(
              "rounded-md border px-1 py-0.5 font-mono text-[0.9em]",
              part.token.kind === "icu"
                ? "border-bud-500/25 bg-bud-500/10 text-bud-100"
                : "border-dew-500/25 bg-dew-500/10 text-dew-100",
            )}
          >
            {part.text}
          </span>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function CatIcuStructureSummary({ blocks }: { blocks: CatIcuBlockSummary[] }) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-foreground/8 bg-foreground/3 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">ICU structure</p>
      <ul className="space-y-2">
        {blocks.map((block) => (
          <li key={block.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-md border border-bud-500/25 bg-bud-500/10 px-1.5 py-0.5 font-mono text-bud-100">
                {block.arg}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">{block.type}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {block.options.map((option) => (
                <span
                  key={option}
                  className="rounded border border-foreground/8 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground/72"
                >
                  {option}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CatTargetEditor({
  sourceText,
  value,
  disabled = false,
  onChange,
}: {
  sourceText: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const sourceAnalysis = useMemo(() => analyzeCatMessageFormat(sourceText), [sourceText]);
  const targetAnalysis = useMemo(() => analyzeCatMessageFormat(value), [value]);
  const parityIssues = useMemo(
    () => compareCatMessageFormats(sourceAnalysis, targetAnalysis),
    [sourceAnalysis, targetAnalysis],
  );
  const missingTokens = useMemo(
    () => missingCatMessageTokens(sourceText, value),
    [sourceText, value],
  );
  const targetSignatures = useMemo(() => presentTokenSignatures(targetAnalysis), [targetAnalysis]);
  const sourceTokens = sourceAnalysis.tokens.filter((token) => token.kind !== "pound");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      createCatMessageFormatExtension(),
    ] as unknown as Extensions,
    content: textDocFromValue(value),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(editorText(activeEditor));
    },
    editorProps: {
      attributes: {
        class: cn(
          "min-h-36 px-4 py-4 text-lg leading-relaxed text-foreground/92 focus:outline-none md:text-lg",
          "whitespace-pre-wrap break-words",
        ),
        "aria-label": "Target translation",
        "data-placeholder": "Enter translation...",
        autocapitalize: "off",
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (editorText(editor) === value) {
      return;
    }

    editor.commands.setContent(textDocFromValue(value), { emitUpdate: false });
  }, [editor, value]);

  function insertToken(token: CatMessageToken) {
    if (!editor || disabled) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(token.literal || tokenLabel(token))
      .run();
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-2xl border border-foreground/12 bg-background shadow-sm transition-colors",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          "[&_.cat-mf-token]:rounded-md [&_.cat-mf-token]:px-1 [&_.cat-mf-token]:py-0.5 [&_.cat-mf-token]:font-mono [&_.cat-mf-token]:text-[0.9em]",
          "[&_.cat-mf-placeholder]:bg-dew-500/10 [&_.cat-mf-placeholder]:text-dew-100",
          "[&_.cat-mf-icu]:bg-bud-500/10 [&_.cat-mf-icu]:text-bud-100",
          "[&_.cat-mf-pound]:bg-grove-500/10 [&_.cat-mf-pound]:text-grove-100",
          "[&_.cat-mf-tag]:bg-foreground/8 [&_.cat-mf-tag]:text-foreground/82",
          "[&_.cat-mf-error]:rounded-md [&_.cat-mf-error]:bg-flame-700/20 [&_.cat-mf-error]:text-flame-100",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
          disabled && "opacity-60",
        )}
        aria-invalid={parityIssues.length > 0}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="min-h-36 px-4 py-4 text-lg text-muted-foreground" />
        )}
      </div>

      {sourceTokens.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs font-medium text-muted-foreground">Required tokens</span>
          {sourceTokens.map((token) => {
            const isMissing = missingTokens.some((missingToken) => missingToken.id === token.id);
            const isPresent = targetSignatures.has(
              token.kind === "icu"
                ? `${token.kind}:${token.name}:${token.type}:${(token.options ?? []).join("|")}`
                : `${token.kind}:${token.name}`,
            );

            return (
              <Button
                key={token.id}
                variant="outline"
                size="sm"
                onClick={() => insertToken(token)}
                disabled={disabled}
                className={cn(
                  "h-7 rounded-full px-2 font-mono text-xs",
                  isMissing && "border-bud-500/40 bg-bud-500/10 text-bud-100",
                  isPresent && !isMissing && "text-muted-foreground",
                )}
              >
                {tokenLabel(token)}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
