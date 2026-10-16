import { BracketsCurlyIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/primitives/cn";
import {
  splitTemplate,
  type UpstreamField,
} from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import type { WorkflowValueType } from "@/lib/visual-workflows/schema/types";

import { DATA_TYPE_CLASS } from "./nodes/visual-workflow-compact-node";
import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import {
  WorkflowTemplateEditor,
  type FieldReferenceDescription,
  type WorkflowTemplateEditorHandle,
} from "./workflow-template-editor";

/** A setting that a wire or an earlier step's field can feed: its port, and what feeds it. */
export type BoundPort = {
  id: string;
  type: WorkflowValueType;
  required: boolean;
  /** What gives the setting its value, shown in place of its editor. */
  source?: {
    /** The step the value comes from, marked on the canvas under the pointer. */
    nodeId?: string;
    label: string;
    detail?: string;
    removeLabel: string;
    onRemove?: () => void;
  };
  /** The fields of earlier steps that can be put into the text. */
  fields: readonly UpstreamField[];
  stepTitle: (nodeId: string) => string;
  /** Whether a step runs before this one, so its fields can be read here. */
  runsBefore?: (nodeId: string) => boolean;
  /** The trigger step, whose fields are read as `trigger.<path>`. */
  triggerId?: string;
  /** Called with the step a value under the pointer comes from, and with null when it leaves. */
  onPoint?: (nodeId: string | null) => void;
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

/** A field in a menu of earlier steps' fields: its port, path, type and last value. */
function FieldOption({ field }: { field: UpstreamField }) {
  return (
    <>
      <PortMark type={field.type} filled />
      <span className="min-w-0 truncate font-mono text-xs">{field.path}</span>
      <span className="text-xs text-muted-foreground">{field.type}</span>
      <span className="ms-auto max-w-28 truncate text-xs text-muted-foreground">
        {sampleText(field.sample)}
      </span>
    </>
  );
}

/**
 * A setting that can be typed, can read fields of earlier steps inside its text, or can be fed
 * by a wire. Fed, it shows its source in place of the editor. Typed, the fields it reads show as
 * pills, while it is edited too; `{{` or the Insert button adds one.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const editorRef = useRef<WorkflowTemplateEditorHandle>(null);
  const labelId = `${id}-label`;

  const canInsert = editable && (port.type === "string" || port.type === "unknown");
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
  const insert = (field: UpstreamField) => {
    setMenuOpen(false);
    setSearch("");
    editorRef.current?.insert(field);
  };
  const point = (nodeId: string | null | undefined) => port.onPoint?.(nodeId ?? null);
  const describeReference = (raw: string): FieldReferenceDescription => {
    const segment = splitTemplate(raw).find((entry) => entry.kind === "reference");
    if (!segment || segment.kind !== "reference" || (!segment.trigger && !segment.nodeId)) {
      return { step: null, field: raw, title: raw, nodeId: null, broken: false };
    }
    const nodeId = segment.trigger ? (port.triggerId ?? null) : segment.nodeId;
    const step = segment.trigger
      ? port.triggerId
        ? port.stepTitle(port.triggerId)
        : intl.formatMessage(messages.triggerBadge)
      : port.stepTitle(segment.nodeId!);
    const field = segment.path.join(".");
    const broken = nodeId === null || (port.runsBefore ? !port.runsBefore(nodeId) : false);
    const reference = `${step} › ${segment.path.join(" › ")}`;
    return {
      step,
      field,
      title: broken
        ? intl.formatMessage(messages.fieldReferenceUnavailable, { reference })
        : reference,
      nodeId,
      broken,
    };
  };

  return (
    <div className="grid gap-1.5" data-slot="bound-field">
      <div className="flex items-center gap-1.5">
        <PortMark type={port.type} filled={port.source !== undefined} />
        <Label
          id={labelId}
          onClick={port.source || !editable ? undefined : () => editorRef.current?.focus()}
        >
          {label}
        </Label>
        <span className="text-xs text-muted-foreground">{port.type}</span>
      </div>
      {port.source ? (
        <div
          data-slot="bound-source"
          className="flex min-h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 ps-3 pe-1 text-sm"
          onMouseEnter={() => point(port.source?.nodeId)}
          onMouseLeave={() => point(null)}
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
          <WorkflowTemplateEditor
            ref={editorRef}
            id={id}
            labelId={labelId}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            invalid={invalid}
            multiline={multiline}
            fields={canInsert ? port.fields : []}
            stepTitle={port.stepTitle}
            describeReference={describeReference}
            onPoint={port.onPoint}
            renderField={(field) => <FieldOption field={field} />}
            emptyLabel={intl.formatMessage(messages.insertFieldEmpty)}
            className={cn(canInsert && "pe-9")}
          />
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
                            onMouseEnter={() => point(field.nodeId)}
                            onMouseLeave={() => point(null)}
                          >
                            <FieldOption field={field} />
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
