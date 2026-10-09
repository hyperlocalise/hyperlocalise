"use client";

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
import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension, type Extensions } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { formatMarkdownMarkupForDisplay } from "@/components/content-editor/message-format/content-editor-markdown-markup";
import {
  analyzeCatMessageFormat,
  contentEditorMessageTokenSignature,
  compareCatMessageFormats,
  missingCatMessageTokensFromAnalysis,
  type ContentEditorIcuBlockSummary,
  type ContentEditorMessageAnalysis,
  type ContentEditorMessageToken,
} from "@/components/content-editor/message-format/content-editor-message-format";
import {
  contentEditorMessageTokenMissingClass,
  contentEditorMessageTokenToneClass,
  type ContentEditorMessageTokenVisualKind,
} from "@/components/content-editor/message-format/content-editor-message-token-styles";
import { glossaryTermRanges } from "@/components/content-editor/intelligence/content-editor-glossary-checks";
import { ContentEditorCharacterMeter } from "@/components/content-editor/segment/content-editor-character-meter";
import { contentEditorTargetEditorMessages } from "@/components/content-editor/shared/content-editor.messages";

const TEXT_BLOCK_SEPARATOR = "\n";
const TEXT_LEAF_TEXT = "\n";

type TextOffsetRange = {
  offsetStart: number;
  offsetEnd: number;
  posStart: number;
};

function documentSearchText(doc: ProseMirrorNode) {
  return doc.textBetween(0, doc.content.size, TEXT_BLOCK_SEPARATOR, TEXT_LEAF_TEXT);
}

/**
 * Map offsets in `documentSearchText` back to document positions.
 * `textBetween` inserts the block separator before every textblock after the
 * first, including empty paragraphs, so a blank line contributes two newlines.
 */
export function contentEditorTextOffsetRanges(doc: ProseMirrorNode): TextOffsetRange[] {
  const textRanges: TextOffsetRange[] = [];
  let offset = 0;
  let seenSeparatorBlock = false;

  doc.descendants((node, pos) => {
    const leafText = node.isLeaf && !node.isText ? TEXT_LEAF_TEXT : "";
    const isSeparatorBlock =
      node.isBlock && ((node.isLeaf && leafText.length > 0) || node.isTextblock);

    if (isSeparatorBlock) {
      if (seenSeparatorBlock) {
        offset += TEXT_BLOCK_SEPARATOR.length;
      } else {
        seenSeparatorBlock = true;
      }
    }

    if (node.isText && node.text) {
      textRanges.push({
        offsetStart: offset,
        offsetEnd: offset + node.text.length,
        posStart: pos,
      });
      offset += node.text.length;
      return;
    }

    if (leafText) {
      offset += leafText.length;
    }
  });

  return textRanges;
}

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

function tokenVisualKind(token: ContentEditorMessageToken): ContentEditorMessageTokenVisualKind {
  switch (token.kind) {
    case "icu":
      return "icu";
    case "pound":
      return "pound";
    case "tag":
      return "tag";
    case "markup":
      return "markup";
    default:
      return "placeholder";
  }
}

function tokenClassName(token: ContentEditorMessageToken) {
  const kind = tokenVisualKind(token);
  return cn("cat-mf-token", `cat-mf-${kind}`, contentEditorMessageTokenToneClass(kind));
}

function decorationRangesForToken(
  textRanges: Array<{ offsetStart: number; offsetEnd: number; posStart: number }>,
  token: ContentEditorMessageToken,
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

function createQaHighlightExtension(
  getHighlight: () => { tokens: string[]; status: "warn" | "fail"; wholeTerm: boolean },
) {
  return Extension.create({
    name: "contentEditorQaHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("contentEditorQaHighlights"),
          props: {
            decorations(state) {
              const { tokens, status, wholeTerm } = getHighlight();
              if (tokens.length === 0) {
                return DecorationSet.empty;
              }

              const textRanges = contentEditorTextOffsetRanges(state.doc);
              const text = documentSearchText(state.doc);
              const decorations = highlightRangesForTokens(text, tokens, wholeTerm).flatMap(
                (range) =>
                  decorationRangesForToken(textRanges, {
                    id: `qa-${range.start}`,
                    kind: "argument",
                    name: "qa",
                    literal: "",
                    start: range.start,
                    end: range.end,
                  }).map(({ from, to }) =>
                    Decoration.inline(from, to, {
                      class: qaHighlightClassName(status),
                      "data-qa-highlight": "true",
                    }),
                  ),
              );

              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

function createCatMessageFormatExtension() {
  return Extension.create({
    name: "contentEditorMessageFormatDecorations",
    addProseMirrorPlugins() {
      let previousDocument: unknown;
      let previousDecorations = DecorationSet.empty;
      return [
        new Plugin({
          key: new PluginKey("contentEditorMessageFormatDecorations"),
          props: {
            decorations(state) {
              if (state.doc === previousDocument) return previousDecorations;
              const textRanges = contentEditorTextOffsetRanges(state.doc);
              const text = documentSearchText(state.doc);
              const analysis = analyzeCatMessageFormat(text);
              const decorations: Decoration[] = [];

              analysis.tokens.forEach((token) => {
                decorationRangesForToken(textRanges, token).forEach(({ from, to }) => {
                  if (token.kind === "markup") {
                    decorations.push(
                      Decoration.inline(from, to, {
                        class: cn(tokenClassName(token), "cat-mf-markup-chip"),
                        "data-cat-label": token.displayLabel ?? token.name,
                      }),
                    );
                    return;
                  }
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
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: cn("cat-mf-error", contentEditorMessageTokenToneClass("error")),
                    }),
                  );
                });
              }

              previousDocument = state.doc;
              previousDecorations = DecorationSet.create(state.doc, decorations);
              return previousDecorations;
            },
          },
        }),
      ];
    },
  });
}

const contentEditorTargetEditorExtensions = [
  StarterKit.configure({ heading: false }),
  createCatMessageFormatExtension(),
] as unknown as Extensions;

function tokenLabel(token: ContentEditorMessageToken) {
  if (token.kind === "icu") {
    return `{${token.name}, ${token.type}}`;
  }

  if (token.kind === "tag") {
    return `<${token.name}>`;
  }

  if (token.kind === "markup") {
    return token.displayLabel ?? token.name;
  }

  return token.literal || `{${token.name}}`;
}

function presentTokenSignatures(analysis: ContentEditorMessageAnalysis) {
  return new Set(analysis.tokens.map((token) => contentEditorMessageTokenSignature(token)));
}

function highlightRangesForTokens(text: string, tokens: string[], wholeTerm = false) {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (wholeTerm) {
      ranges.push(...glossaryTermRanges(text, token));
      continue;
    }
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(token, from);
      if (index < 0) {
        break;
      }
      ranges.push({ start: index, end: index + token.length });
      from = index + token.length;
    }
  }
  return ranges.toSorted((first, second) => first.start - second.start);
}

function qaHighlightClassName(status: "warn" | "fail" = "warn") {
  return cn(
    "box-decoration-clone rounded-sm",
    status === "fail" ? "bg-destructive/20" : "bg-warning/25",
  );
}

function renderHighlightedPlainText(
  text: string,
  tokens: string[],
  status: "warn" | "fail",
  keyPrefix: string,
  wholeTerm: boolean,
) {
  const ranges = highlightRangesForTokens(text, tokens, wholeTerm);
  if (ranges.length === 0) {
    return text;
  }

  const parts: Array<{ key: string; text: string; highlighted: boolean }> = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start < cursor) {
      return;
    }
    if (cursor < range.start) {
      parts.push({
        key: `${keyPrefix}-text-${cursor}`,
        text: text.slice(cursor, range.start),
        highlighted: false,
      });
    }
    parts.push({
      key: `${keyPrefix}-mark-${index}`,
      text: text.slice(range.start, range.end),
      highlighted: true,
    });
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push({
      key: `${keyPrefix}-text-${cursor}`,
      text: text.slice(cursor),
      highlighted: false,
    });
  }

  return parts.map((part) =>
    part.highlighted ? (
      <mark key={part.key} data-qa-highlight="true" className={qaHighlightClassName(status)}>
        {part.text}
      </mark>
    ) : (
      <span key={part.key}>{part.text}</span>
    ),
  );
}

export function ContentEditorMessagePreview({
  message,
  companionMessage,
  className,
  highlightTokens = [],
  highlightStatus = "warn",
  highlightWholeTerm = false,
}: {
  message: string;
  companionMessage?: string;
  className?: string;
  highlightTokens?: string[];
  highlightStatus?: "warn" | "fail";
  highlightWholeTerm?: boolean;
}) {
  const displayMessage = useMemo(
    () => formatMarkdownMarkupForDisplay(message, companionMessage),
    [companionMessage, message],
  );
  const analysis = useMemo(() => analyzeCatMessageFormat(displayMessage), [displayMessage]);
  const ranges = analysis.tokens
    .filter((token) => token.kind !== "pound")
    .toSorted((first, second) => first.start - second.start)
    .reduce<ContentEditorMessageToken[]>((items, token) => {
      const previous = items.at(-1);
      if (previous && token.start < previous.end) {
        return items;
      }
      return [...items, token];
    }, []);

  if (ranges.length === 0) {
    return (
      <span className={className}>
        {renderHighlightedPlainText(
          displayMessage,
          highlightTokens,
          highlightStatus,
          "plain",
          highlightWholeTerm,
        )}
      </span>
    );
  }

  let cursor = 0;
  const parts: Array<{ text: string; token?: ContentEditorMessageToken; key: string }> = [];
  ranges.forEach((token) => {
    if (cursor < token.start) {
      parts.push({ key: `text-${cursor}`, text: displayMessage.slice(cursor, token.start) });
    }
    parts.push({
      key: token.id,
      text:
        token.kind === "markup"
          ? (token.displayLabel ?? token.name)
          : displayMessage.slice(token.start, token.end),
      token,
    });
    cursor = token.end;
  });

  if (cursor < displayMessage.length) {
    parts.push({ key: `text-${cursor}`, text: displayMessage.slice(cursor) });
  }

  return (
    <span className={className}>
      {parts.map((part) =>
        part.token ? (
          <span
            key={part.key}
            className={cn(
              "rounded-md border px-1 py-0.5 font-mono text-[0.9em]",
              contentEditorMessageTokenToneClass(tokenVisualKind(part.token)),
            )}
            title={part.token.kind === "markup" ? part.token.literal : undefined}
          >
            {part.text}
          </span>
        ) : (
          <span key={part.key}>
            {renderHighlightedPlainText(
              part.text,
              highlightTokens,
              highlightStatus,
              part.key,
              highlightWholeTerm,
            )}
          </span>
        ),
      )}
    </span>
  );
}

export function ContentEditorIcuStructureSummary({
  blocks,
}: {
  blocks: ContentEditorIcuBlockSummary[];
}) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">
        <FormattedMessage {...contentEditorTargetEditorMessages.icuStructure} />
      </p>
      <ul className="space-y-2">
        {blocks.map((block) => (
          <li key={block.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <FormattedMessage
                {...contentEditorTargetEditorMessages.icuBlockSummary}
                values={{
                  arg: (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-foreground",
                        contentEditorMessageTokenToneClass("icu"),
                      )}
                    >
                      {block.arg}
                    </span>
                  ),
                  type: block.type,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {block.options.map((option) => (
                <span
                  key={option}
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-subtle-foreground"
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

export function ContentEditorTargetEditor({
  sourceText,
  value,
  maxLength,
  disabled = false,
  compact = false,
  inline = false,
  autoFocus = false,
  ariaLabel,
  highlightTokens,
  highlightStatus = "warn",
  highlightWholeTerm = false,
  onChange,
}: {
  sourceText: string;
  value: string;
  maxLength?: number;
  disabled?: boolean;
  compact?: boolean;
  inline?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  highlightTokens?: string[];
  highlightStatus?: "warn" | "fail";
  highlightWholeTerm?: boolean;
  onChange: (value: string) => void;
}) {
  const intl = useIntl();
  const valueRef = useRef(value);
  valueRef.current = value;
  const highlightRef = useRef({
    tokens: highlightTokens ?? [],
    status: highlightStatus,
    wholeTerm: highlightWholeTerm,
  });
  highlightRef.current = {
    tokens: highlightTokens ?? [],
    status: highlightStatus,
    wholeTerm: highlightWholeTerm,
  };
  const sourceAnalysis = useMemo(() => analyzeCatMessageFormat(sourceText), [sourceText]);
  const targetAnalysis = useMemo(() => analyzeCatMessageFormat(value), [value]);
  const parityIssues = useMemo(
    () => compareCatMessageFormats(sourceAnalysis, targetAnalysis),
    [sourceAnalysis, targetAnalysis],
  );
  const missingTokens = useMemo(
    () => missingCatMessageTokensFromAnalysis(sourceAnalysis, targetAnalysis),
    [sourceAnalysis, targetAnalysis],
  );
  const targetSignatures = useMemo(() => presentTokenSignatures(targetAnalysis), [targetAnalysis]);
  const sourceTokens = sourceAnalysis.tokens.filter((token) => token.kind !== "pound");
  const characterCount = value.length;
  const isOverMaxLength = maxLength !== undefined && characterCount > maxLength;

  const editor = useEditor({
    extensions: [
      ...contentEditorTargetEditorExtensions,
      createQaHighlightExtension(() => highlightRef.current),
    ],
    content: textDocFromValue(value),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      const nextValue = editorText(activeEditor);
      // Ignore no-op updates (e.g. mount/focus round-trips) so focusing a loaded
      // translation does not mark the segment as an unsaved draft.
      if (nextValue === valueRef.current) {
        return;
      }
      onChange(nextValue);
    },
    editorProps: {
      attributes: {
        class: cn(
          compact
            ? "min-h-8 px-2.5 py-1.5 text-sm leading-snug text-foreground focus:outline-none"
            : "min-h-36 px-4 py-4 text-lg leading-relaxed text-foreground focus:outline-none md:text-lg",
          "whitespace-pre-wrap break-words",
        ),
        role: "textbox",
        "aria-label":
          ariaLabel ?? intl.formatMessage(contentEditorTargetEditorMessages.targetTranslationAria),
        "data-placeholder": intl.formatMessage(contentEditorTargetEditorMessages.targetPlaceholder),
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

  useEffect(() => {
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);

  const highlightTokenKey = (highlightTokens ?? []).join("\0");

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.view.dispatch(editor.state.tr.setMeta("contentEditorQaHighlights", highlightTokenKey));
  }, [editor, highlightStatus, highlightTokenKey, highlightWholeTerm]);

  function insertToken(token: ContentEditorMessageToken) {
    if (!editor || disabled) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent(token.literal || tokenLabel(token))
      .run();
  }

  const showCharacterCount = !inline && (maxLength !== undefined || characterCount > 0);
  const characterCountLabel = showCharacterCount ? (
    <ContentEditorCharacterMeter count={characterCount} maxLength={maxLength} variant="compact" />
  ) : null;

  return (
    <div className={cn(!compact && "space-y-2")}>
      <div
        className={cn(
          compact
            ? "overflow-hidden rounded-lg border border-border bg-background transition-colors"
            : "rounded-2xl border border-border bg-background shadow-sm transition-colors",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          "[&_.cat-mf-token]:rounded-md [&_.cat-mf-token]:px-1 [&_.cat-mf-token]:py-0.5 [&_.cat-mf-token]:font-mono [&_.cat-mf-token]:text-[0.9em]",
          // Collapse raw HL*PH sentinel glyphs; ::before paints the short MD#n / HT#n / LQ#n chip.
          "[&_.cat-mf-markup-chip]:text-[0px] [&_.cat-mf-markup-chip]:leading-none",
          "[&_.cat-mf-markup-chip::before]:content-[attr(data-cat-label)] [&_.cat-mf-markup-chip::before]:text-[0.9rem]",
          "[&_.cat-mf-markup-chip::before]:font-mono [&_.cat-mf-markup-chip::before]:leading-normal",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
          disabled && "opacity-60",
        )}
        aria-invalid={parityIssues.length > 0 || isOverMaxLength}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div
            className={cn(
              "text-muted-foreground",
              compact ? "min-h-8 px-2.5 py-1.5 text-sm" : "min-h-36 px-4 py-4 text-lg",
            )}
          />
        )}
        {compact && characterCountLabel ? (
          <div className="flex justify-end border-t border-border/70 px-2.5 py-1">
            {characterCountLabel}
          </div>
        ) : null}
      </div>

      {!compact && characterCountLabel ? (
        <div className="flex justify-end px-1">{characterCountLabel}</div>
      ) : null}

      {sourceTokens.length > 0 && !inline ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs font-medium text-muted-foreground">
            <FormattedMessage {...contentEditorTargetEditorMessages.requiredTokens} />
          </span>
          {sourceTokens.map((token) => {
            const isMissing = missingTokens.some((missingToken) => missingToken.id === token.id);
            const isPresent = targetSignatures.has(contentEditorMessageTokenSignature(token));

            return (
              <Button
                key={token.id}
                variant="outline"
                size="xs"
                onClick={() => insertToken(token)}
                disabled={disabled}
                className={cn(
                  "rounded-full font-mono",
                  isMissing && contentEditorMessageTokenMissingClass,
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
