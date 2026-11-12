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
import { CaretDownIcon, CaretUpIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTextInputId } from "@/lib/visual-workflows/catalog/node-catalog";
import type {
  VisualConcatenateSegment,
  VisualNodeConfig,
  VisualTextMissingBehavior,
  WorkflowValueType,
} from "@/lib/visual-workflows/schema/types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";

const VALUE_TYPES: WorkflowValueType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "unknown",
];
const MISSING_BEHAVIORS: VisualTextMissingBehavior[] = ["required", "optional", "fallback"];

function MoveAndRemoveButtons({
  index,
  count,
  canRemove = true,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  canRemove?: boolean;
  label: string;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        aria-label={intl.formatMessage(messages.moveTextEntryUp, { label })}
        onClick={() => onMove(-1)}
      >
        <CaretUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === count - 1}
        aria-label={intl.formatMessage(messages.moveTextEntryDown, { label })}
        onClick={() => onMove(1)}
      >
        <CaretDownIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canRemove}
        aria-label={intl.formatMessage(messages.removeTextEntry, { label })}
        onClick={onRemove}
      >
        <TrashIcon />
      </Button>
    </div>
  );
}

function MissingBehaviorFields({
  behavior,
  fallback,
  id,
  onChange,
}: {
  behavior: VisualTextMissingBehavior;
  fallback?: string;
  id: string;
  onChange: (behavior: VisualTextMissingBehavior, fallback?: string) => void;
}) {
  const intl = useIntl();
  return (
    <div className="grid gap-2">
      <Select
        value={behavior}
        onValueChange={(value) => {
          if (!MISSING_BEHAVIORS.includes(value as VisualTextMissingBehavior)) return;
          const next = value as VisualTextMissingBehavior;
          onChange(next, next === "fallback" ? (fallback ?? "") : undefined);
        }}
      >
        <SelectTrigger aria-label={intl.formatMessage(messages.textMissingBehavior)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="required">
            <FormattedMessage {...messages.textMissingRequired} />
          </SelectItem>
          <SelectItem value="optional">
            <FormattedMessage {...messages.textMissingOptional} />
          </SelectItem>
          <SelectItem value="fallback">
            <FormattedMessage {...messages.textMissingFallback} />
          </SelectItem>
        </SelectContent>
      </Select>
      {behavior === "fallback" ? (
        <Input
          id={`${id}-fallback`}
          aria-label={intl.formatMessage(messages.textFallbackValue)}
          value={fallback ?? ""}
          onChange={(event) => onChange("fallback", event.target.value)}
        />
      ) : null}
    </div>
  );
}

export function TextTemplateConfig({
  config,
  onChange,
}: {
  config: Extract<VisualNodeConfig, { kind: "logic.text_template" }>;
  onChange: (config: Extract<VisualNodeConfig, { kind: "logic.text_template" }>) => void;
}) {
  const intl = useIntl();
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="vw-text-template">
          <FormattedMessage {...messages.textTemplateValue} />
        </Label>
        <Textarea
          id="vw-text-template"
          value={config.template}
          placeholder="Hello, {{name}}!"
          onChange={(event) => onChange({ ...config, template: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...messages.textTemplateHint} />
        </p>
      </div>
      <Label>
        <FormattedMessage {...messages.textPlaceholders} />
      </Label>
      {config.placeholders.map((placeholder, index) => (
        <div key={placeholder.id} className="grid gap-2 rounded-md border border-border p-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input
              aria-label={intl.formatMessage(messages.textPlaceholderName, { index: index + 1 })}
              value={placeholder.name}
              onChange={(event) =>
                onChange({
                  ...config,
                  placeholders: config.placeholders.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, name: event.target.value } : entry,
                  ),
                })
              }
            />
            <Select
              value={placeholder.type}
              onValueChange={(type) => {
                if (!VALUE_TYPES.includes(type as WorkflowValueType)) return;
                onChange({
                  ...config,
                  placeholders: config.placeholders.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, type: type as WorkflowValueType } : entry,
                  ),
                });
              }}
            >
              <SelectTrigger
                aria-label={intl.formatMessage(messages.textPlaceholderType, { index: index + 1 })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALUE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MissingBehaviorFields
            id={`vw-placeholder-${placeholder.id}`}
            behavior={placeholder.missingBehavior}
            fallback={placeholder.fallback}
            onChange={(missingBehavior, fallback) =>
              onChange({
                ...config,
                placeholders: config.placeholders.map((entry, entryIndex) => {
                  if (entryIndex !== index) return entry;
                  const { fallback: _removed, ...withoutFallback } = entry;
                  return {
                    ...withoutFallback,
                    missingBehavior,
                    ...(missingBehavior === "fallback" ? { fallback: fallback ?? "" } : {}),
                  };
                }),
              })
            }
          />
          <MoveAndRemoveButtons
            index={index}
            count={config.placeholders.length}
            label={placeholder.name || String(index + 1)}
            onMove={(direction) => {
              const placeholders = [...config.placeholders];
              [placeholders[index], placeholders[index + direction]] = [
                placeholders[index + direction]!,
                placeholders[index]!,
              ];
              onChange({ ...config, placeholders });
            }}
            onRemove={() =>
              onChange({
                ...config,
                placeholders: config.placeholders.filter((_, entryIndex) => entryIndex !== index),
              })
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={config.placeholders.length >= 32}
        onClick={() =>
          onChange({
            ...config,
            placeholders: [
              ...config.placeholders,
              {
                id: createTextInputId(),
                name: `value${config.placeholders.length + 1}`,
                type: "string",
                missingBehavior: "required",
              },
            ],
          })
        }
      >
        <PlusIcon />
        <FormattedMessage {...messages.addTextPlaceholder} />
      </Button>
    </div>
  );
}

export function ConcatenateConfig({
  config,
  onChange,
}: {
  config: Extract<VisualNodeConfig, { kind: "logic.concatenate" }>;
  onChange: (config: Extract<VisualNodeConfig, { kind: "logic.concatenate" }>) => void;
}) {
  const intl = useIntl();
  const updateSegment = (index: number, segment: VisualConcatenateSegment) =>
    onChange({
      ...config,
      segments: config.segments.map((entry, entryIndex) =>
        entryIndex === index ? segment : entry,
      ),
    });
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="vw-concatenate-separator">
          <FormattedMessage {...messages.concatenateSeparator} />
        </Label>
        <Input
          id="vw-concatenate-separator"
          value={config.separator}
          onChange={(event) => onChange({ ...config, separator: event.target.value })}
        />
      </div>
      <Label>
        <FormattedMessage {...messages.concatenateSegments} />
      </Label>
      {config.segments.map((segment, index) => (
        <div key={segment.id} className="grid gap-2 rounded-md border border-border p-2">
          <Select
            value={segment.kind}
            onValueChange={(kind) => {
              if (kind === "literal") updateSegment(index, { id: segment.id, kind, value: "" });
              if (kind === "input")
                updateSegment(index, {
                  id: segment.id,
                  kind,
                  name: `Value ${index + 1}`,
                  type: "string",
                  missingBehavior: "required",
                });
            }}
          >
            <SelectTrigger
              aria-label={intl.formatMessage(messages.concatenateSegmentKind, { index: index + 1 })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="literal">
                <FormattedMessage {...messages.concatenateLiteral} />
              </SelectItem>
              <SelectItem value="input">
                <FormattedMessage {...messages.concatenateInput} />
              </SelectItem>
            </SelectContent>
          </Select>
          {segment.kind === "literal" ? (
            <Textarea
              aria-label={intl.formatMessage(messages.concatenateLiteralValue, {
                index: index + 1,
              })}
              value={segment.value}
              onChange={(event) => updateSegment(index, { ...segment, value: event.target.value })}
            />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Input
                  aria-label={intl.formatMessage(messages.concatenateInputName, {
                    index: index + 1,
                  })}
                  value={segment.name}
                  onChange={(event) =>
                    updateSegment(index, { ...segment, name: event.target.value })
                  }
                />
                <Select
                  value={segment.type}
                  onValueChange={(type) => {
                    if (VALUE_TYPES.includes(type as WorkflowValueType)) {
                      updateSegment(index, { ...segment, type: type as WorkflowValueType });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage(messages.concatenateInputType, {
                      index: index + 1,
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MissingBehaviorFields
                id={`vw-concatenate-${segment.id}`}
                behavior={segment.missingBehavior}
                fallback={segment.fallback}
                onChange={(missingBehavior, fallback) => {
                  const { fallback: _removed, ...withoutFallback } = segment;
                  updateSegment(index, {
                    ...withoutFallback,
                    missingBehavior,
                    ...(missingBehavior === "fallback" ? { fallback: fallback ?? "" } : {}),
                  });
                }}
              />
            </>
          )}
          <MoveAndRemoveButtons
            index={index}
            count={config.segments.length}
            canRemove={config.segments.length > 1}
            label={segment.kind === "literal" ? `Literal ${index + 1}` : segment.name}
            onMove={(direction) => {
              const segments = [...config.segments];
              [segments[index], segments[index + direction]] = [
                segments[index + direction]!,
                segments[index]!,
              ];
              onChange({ ...config, segments });
            }}
            onRemove={() =>
              onChange({
                ...config,
                segments: config.segments.filter((_, entryIndex) => entryIndex !== index),
              })
            }
          />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.segments.length >= 32}
          onClick={() =>
            onChange({
              ...config,
              segments: [
                ...config.segments,
                { id: createTextInputId(), kind: "literal", value: "" },
              ],
            })
          }
        >
          <PlusIcon />
          <FormattedMessage {...messages.addConcatenateLiteral} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.segments.length >= 32}
          onClick={() =>
            onChange({
              ...config,
              segments: [
                ...config.segments,
                {
                  id: createTextInputId(),
                  kind: "input",
                  name: `Value ${config.segments.length + 1}`,
                  type: "string",
                  missingBehavior: "required",
                },
              ],
            })
          }
        >
          <PlusIcon />
          <FormattedMessage {...messages.addConcatenateInput} />
        </Button>
      </div>
    </div>
  );
}
