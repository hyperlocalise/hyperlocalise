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
import {
  BracketsAngleIcon,
  InfoIcon,
  LightbulbIcon,
  LockSimpleIcon,
  MegaphoneSimpleIcon,
  PencilSimpleIcon,
  WarningIcon,
  WarningOctagonIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { createElement, useState, type ReactNode } from "react";
import { useIntl, type MessageDescriptor } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

import {
  DocumentCallout,
  DOCUMENT_CALLOUT_KINDS,
  type DocumentCalloutKind,
} from "./document-editor-callout";
import { MdxComponent, MdxInline, MdxRaw } from "./document-editor-mdx";
import { readJsxStringProps, writeJsxStringProp } from "./document-editor-mdx-syntax";
import { documentEditorMessages as messages } from "./document-editor.messages";

const CALLOUT_STYLES: Record<
  DocumentCalloutKind,
  { icon: Icon; label: MessageDescriptor; className: string; iconClassName: string }
> = {
  note: {
    icon: InfoIcon,
    label: messages.calloutNote,
    className: "border-sky-500/30 bg-sky-500/5",
    iconClassName: "text-sky-600 dark:text-sky-400",
  },
  tip: {
    icon: LightbulbIcon,
    label: messages.calloutTip,
    className: "border-emerald-500/30 bg-emerald-500/5",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  important: {
    icon: MegaphoneSimpleIcon,
    label: messages.calloutImportant,
    className: "border-violet-500/30 bg-violet-500/5",
    iconClassName: "text-violet-600 dark:text-violet-400",
  },
  warning: {
    icon: WarningIcon,
    label: messages.calloutWarning,
    className: "border-amber-500/30 bg-amber-500/5",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  caution: {
    icon: WarningOctagonIcon,
    label: messages.calloutCaution,
    className: "border-red-500/30 bg-red-500/5",
    iconClassName: "text-red-600 dark:text-red-400",
  },
};

function calloutStyle(kind: unknown) {
  return CALLOUT_STYLES[
    (DOCUMENT_CALLOUT_KINDS as readonly unknown[]).includes(kind)
      ? (kind as DocumentCalloutKind)
      : "note"
  ];
}

function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
  const intl = useIntl();
  const style = calloutStyle(node.attrs.kind);
  const icon = createElement(style.icon, {
    className: cn("size-4", style.iconClassName),
    weight: "fill",
  });
  const intercomColors =
    typeof node.attrs.backgroundColor === "string" && node.attrs.backgroundColor
      ? {
          backgroundColor: node.attrs.backgroundColor,
          borderColor:
            typeof node.attrs.borderColor === "string" ? node.attrs.borderColor : undefined,
        }
      : undefined;
  return (
    <NodeViewWrapper
      as="aside"
      data-callout={node.attrs.kind}
      data-background-color={node.attrs.backgroundColor || undefined}
      data-border-color={node.attrs.borderColor || undefined}
      className={cn(
        "my-4 flex gap-3 rounded-xl border px-4 py-3",
        !intercomColors && style.className,
      )}
      style={intercomColors}
    >
      <div contentEditable={false} className="pt-1">
        {editor.isEditable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={intl.formatMessage(style.label)}
                  className="rounded-md p-0.5 hover:bg-foreground/5"
                />
              }
            >
              {icon}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {DOCUMENT_CALLOUT_KINDS.map((kind) => (
                <DropdownMenuItem key={kind} onClick={() => updateAttributes({ kind })}>
                  {createElement(CALLOUT_STYLES[kind].icon, {
                    className: cn("size-4", CALLOUT_STYLES[kind].iconClassName),
                    weight: "fill",
                  })}
                  {intl.formatMessage(CALLOUT_STYLES[kind].label)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          icon
        )}
      </div>
      <NodeViewContent className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
    </NodeViewWrapper>
  );
}

function MdxSourcePopover({
  value,
  onApply,
  trigger,
}: {
  value: string;
  onApply: (value: string) => void;
  trigger: ReactNode;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger render={<span />}>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem]">
        <PopoverTitle className="text-sm">
          {intl.formatMessage(messages.mdxEditSource)}
        </PopoverTitle>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          className="min-h-32 font-mono text-xs"
          aria-label={intl.formatMessage(messages.mdxEditSource)}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            {intl.formatMessage(messages.mdxSave)}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MdxRawView({ node, editor, updateAttributes, selected }: NodeViewProps) {
  const intl = useIntl();
  const value = String(node.attrs.value ?? "");
  return (
    <NodeViewWrapper
      className={cn(
        "group/mdx-raw my-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2",
        selected && "ring-2 ring-ring/40",
      )}
    >
      <div contentEditable={false} className="flex items-start gap-2">
        <LockSimpleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
          {value}
        </pre>
        {editor.isEditable ? (
          <MdxSourcePopover
            value={value}
            onApply={(next) => updateAttributes({ value: next })}
            trigger={
              <Button
                size="icon-xs"
                variant="ghost"
                className="opacity-0 group-hover/mdx-raw:opacity-100 focus-visible:opacity-100"
                aria-label={intl.formatMessage(messages.mdxEditSource)}
              >
                <PencilSimpleIcon />
              </Button>
            }
          />
        ) : null}
      </div>
      <span className="sr-only">{intl.formatMessage(messages.mdxLocked)}</span>
    </NodeViewWrapper>
  );
}

function MdxComponentView({ node, editor, updateAttributes }: NodeViewProps) {
  const intl = useIntl();
  const openTag = String(node.attrs.openTag ?? "");
  const props = readJsxStringProps(openTag);
  return (
    <NodeViewWrapper
      data-mdx-component={node.attrs.name}
      className="group/mdx my-4 rounded-xl border border-border bg-card shadow-xs"
    >
      <div
        contentEditable={false}
        className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5"
      >
        <BracketsAngleIcon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {node.attrs.name}
        </span>
        {props.length > 0 ? (
          <span className="truncate text-xs text-muted-foreground/80">
            {props.map((prop) => prop.value).join(" · ")}
          </span>
        ) : null}
        <div className="ms-auto">
          <Popover>
            <PopoverTrigger
              render={<Button size="xs" variant="ghost" className="text-muted-foreground" />}
            >
              {intl.formatMessage(messages.mdxProperties)}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <PopoverTitle className="text-sm">{`<${node.attrs.name}>`}</PopoverTitle>
              {props.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(messages.mdxNoProperties)}
                </p>
              ) : (
                props.map((prop) => (
                  <label key={prop.name} className="flex flex-col gap-1">
                    <span className="font-mono text-xs text-muted-foreground">{prop.name}</span>
                    <Input
                      defaultValue={prop.value}
                      disabled={!editor.isEditable}
                      onBlur={(event) => {
                        const value = event.currentTarget.value;
                        if (value !== prop.value) {
                          updateAttributes({
                            openTag: writeJsxStringProp(openTag, prop.name, value),
                          });
                        }
                      }}
                    />
                  </label>
                ))
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <NodeViewContent className="px-4 py-1 [&>*:first-child]:mt-2 [&>*:last-child]:mb-2" />
    </NodeViewWrapper>
  );
}

function MdxInlineView({ node, editor, updateAttributes }: NodeViewProps) {
  const value = String(node.attrs.value ?? "");
  const chip = (
    <code className="mx-0.5 inline-block max-w-[18rem] truncate rounded-md border border-dashed border-border bg-muted/50 px-1.5 align-baseline font-mono text-[0.8em] text-muted-foreground">
      {value}
    </code>
  );
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      {editor.isEditable ? (
        <MdxSourcePopover
          value={value}
          onApply={(next) => updateAttributes({ value: next })}
          trigger={chip}
        />
      ) : (
        chip
      )}
    </NodeViewWrapper>
  );
}

export const DocumentCalloutWithView = DocumentCallout.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

export const MdxRawWithView = MdxRaw.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MdxRawView);
  },
});

export const MdxComponentWithView = MdxComponent.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MdxComponentView);
  },
});

export const MdxInlineWithView = MdxInline.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MdxInlineView, { as: "span" });
  },
});
