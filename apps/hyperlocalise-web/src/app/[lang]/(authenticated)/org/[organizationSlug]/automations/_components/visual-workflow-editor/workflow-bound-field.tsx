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
import { BracketsCurlyIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";
import {
  fieldReference,
  readsFields,
  splitTemplate,
  type UpstreamField,
} from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import type { WorkflowValueType } from "@/lib/visual-workflows/schema/types";

import { DATA_TYPE_CLASS } from "./nodes/visual-workflow-compact-node";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

/** A setting that a wire or an earlier step's field can feed: its port, and what feeds it. */
export type BoundPort = {
  id: string;
  type: WorkflowValueType;
  required: boolean;
  /** What gives the setting its value, shown in place of its editor. */
  source?: {
    label: string;
    detail?: string;
    removeLabel: string;
    onRemove?: () => void;
  };
  /** The fields of earlier steps that can be put into the text. */
  fields: readonly UpstreamField[];
  stepTitle: (nodeId: string) => string;
  /** The trigger step, whose fields are read as `trigger.<path>`. */
  triggerId?: string;
};

const SAMPLE_LENGTH = 40;

function sampleText(value: unknown): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH - 1)}…` : text;
}

/** The mark beside a setting's label: the port on the card, hollow until something feeds it. */
function PortMark({ type, filled }: { type: WorkflowValueType; filled: boolean }) {
  return (
    <span
      aria-hidden
      data-slot="port-mark"
      data-filled={filled || undefined}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-current",
        filled ? "bg-current" : "bg-background",
        DATA_TYPE_CLASS[type],
      )}
    />
  );
}

/**
 * A setting that can be typed, can read fields of earlier steps inside its text, or can be fed
 * by a wire. Fed, it shows its source in place of the editor. Typed, it shows the fields it reads
 * as pills until it is clicked, then as text.
 */
export function WorkflowBoundField({
  id,
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
  description,
  multiline = false,
  editable = true,
  port,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  description?: string;
  multiline?: boolean;
  /** Off for a setting that only a wire can feed. */
  editable?: boolean;
  port: BoundPort;
}) {
  const intl = useIntl();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Where the next field goes: the caret as it was, else the end of the text.
  const caretRef = useRef<number | null>(null);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  useEffect(() => {
    if (pendingCaret === null) return;
    const control = controlRef.current;
    if (control) {
      control.focus();
      control.setSelectionRange(pendingCaret, pendingCaret);
    }
    setPendingCaret(null);
  }, [pendingCaret]);

  const canInsert = editable && (port.type === "string" || port.type === "unknown");
  const showPills = editable && !editing && readsFields(value);
  const needle = search.trim().toLowerCase();
  const shownFields = port.fields.filter(
    (field) =>
      !needle || `${port.stepTitle(field.nodeId)} ${field.path}`.toLowerCase().includes(needle),
  );
  const groups = [...new Set(shownFields.map((field) => field.nodeId))].map((nodeId) => ({
    nodeId,
    title: port.stepTitle(nodeId),
    fields: shownFields.filter((field) => field.nodeId === nodeId),
  }));
  const rememberCaret = () => {
    caretRef.current = controlRef.current?.selectionStart ?? null;
  };
  const insert = (field: UpstreamField) => {
    const at = caretRef.current ?? value.length;
    const reference = fieldReference(field);
    onChange(`${value.slice(0, at)}${reference}${value.slice(at)}`);
    setMenuOpen(false);
    setSearch("");
    setEditing(true);
    setPendingCaret(at + reference.length);
  };
  const referenceTitle = (
    segment: Extract<ReturnType<typeof splitTemplate>[number], { kind: "reference" }>,
  ) => {
    const step = segment.trigger
      ? port.triggerId
        ? port.stepTitle(port.triggerId)
        : intl.formatMessage(messages.triggerBadge)
      : segment.nodeId
        ? port.stepTitle(segment.nodeId)
        : null;
    return step ? [step, ...segment.path].join(" › ") : segment.raw;
  };

  const controlClass = cn(canInsert && "pe-9");
  const control = multiline ? (
    <Textarea
      ref={controlRef as React.RefObject<HTMLTextAreaElement | null>}
      id={id}
      value={value}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      className={controlClass}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        rememberCaret();
        setEditing(false);
      }}
      onSelect={rememberCaret}
    />
  ) : (
    <Input
      ref={controlRef as React.RefObject<HTMLInputElement | null>}
      id={id}
      value={value}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      className={controlClass}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        rememberCaret();
        setEditing(false);
      }}
      onSelect={rememberCaret}
    />
  );

  return (
    <div className="grid gap-1.5" data-slot="bound-field">
      <div className="flex items-center gap-1.5">
        <PortMark type={port.type} filled={port.source !== undefined} />
        <Label htmlFor={showPills || port.source || !editable ? undefined : id} id={`${id}-label`}>
          {label}
        </Label>
        <span className="text-xs text-muted-foreground">{port.type}</span>
      </div>
      {port.source ? (
        <div
          data-slot="bound-source"
          className="flex min-h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 ps-3 pe-1 text-sm"
        >
          <PlugsConnectedIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{port.source.label}</span>
            {port.source.detail ? (
              <span className="text-muted-foreground"> › {port.source.detail}</span>
            ) : null}
          </span>
          {port.source.onRemove ? (
            <Button type="button" variant="ghost" size="xs" onClick={port.source.onRemove}>
              {port.source.removeLabel}
            </Button>
          ) : null}
        </div>
      ) : !editable ? (
        <p
          data-slot="bound-unwired"
          className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
        >
          <FormattedMessage {...messages.connectOnCanvas} />
        </p>
      ) : (
        <div className="relative">
          {showPills ? (
            // Click to edit the text. Until then the fields it reads show as pills.
            <button
              type="button"
              aria-labelledby={`${id}-label`}
              aria-invalid={invalid || undefined}
              data-slot="bound-pills"
              className={cn(
                "flex w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-input/30 px-3 py-1.5 text-left text-sm whitespace-pre-wrap aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20",
                multiline ? "min-h-16 content-start" : "min-h-9",
                canInsert && "pe-9",
              )}
              onClick={() => {
                caretRef.current = value.length;
                setEditing(true);
                setPendingCaret(value.length);
              }}
            >
              {splitTemplate(value).map((segment, index) =>
                segment.kind === "text" ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <span
                    key={index}
                    data-slot="field-pill"
                    title={referenceTitle(segment)}
                    className="inline-flex h-5.5 items-center rounded-md border border-primary/25 bg-primary/10 px-1.5 text-xs font-medium text-primary"
                  >
                    {segment.path.at(-1) ?? segment.raw}
                  </span>
                ),
              )}
            </button>
          ) : (
            control
          )}
          {canInsert ? (
            <Popover
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuOpen(open);
                if (!open) setSearch("");
              }}
            >
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute end-1.5 top-1.5 text-muted-foreground"
                    aria-label={intl.formatMessage(messages.insertField, { label })}
                    title={intl.formatMessage(messages.insertFieldTitle)}
                    onMouseDown={rememberCaret}
                  />
                }
              >
                <BracketsCurlyIcon />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0" sideOffset={4}>
                <Command
                  shouldFilter={false}
                  label={intl.formatMessage(messages.insertFieldSearch)}
                >
                  <CommandInput
                    value={search}
                    onValueChange={setSearch}
                    placeholder={intl.formatMessage(messages.insertFieldSearch)}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <FormattedMessage {...messages.insertFieldEmpty} />
                    </CommandEmpty>
                    {groups.map((group) => (
                      <CommandGroup key={group.nodeId} heading={group.title}>
                        {group.fields.map((field) => (
                          <CommandItem
                            key={`${field.nodeId}.${field.path}`}
                            value={`${field.nodeId}.${field.path}`}
                            onSelect={() => insert(field)}
                          >
                            <PortMark type={field.type} filled />
                            <span className="min-w-0 truncate font-mono text-xs">{field.path}</span>
                            <span className="text-xs text-muted-foreground">{field.type}</span>
                            <span className="ms-auto max-w-28 truncate text-xs text-muted-foreground">
                              {sampleText(field.sample)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      )}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
