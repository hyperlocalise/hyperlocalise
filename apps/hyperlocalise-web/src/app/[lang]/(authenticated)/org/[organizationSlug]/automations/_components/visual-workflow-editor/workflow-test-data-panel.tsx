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
import { useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isTriggerType } from "@/lib/visual-workflows/catalog/node-catalog";
import {
  exampleTestData,
  getTestDataFields,
  testDataFromOutput,
  withTestValue,
  type MissingTestValue,
} from "@/lib/visual-workflows/editor/visual-workflow-test-data";
import { readWorkflowPath } from "@/lib/visual-workflows/runtime/bindings";
import type {
  VisualWorkflowRfNode,
  WorkflowOutputField,
} from "@/lib/visual-workflows/schema/types";

import { visualWorkflowEditorMessages as messages } from "./visual-workflow-editor.messages";
import { WorkflowJsonField } from "./workflow-data-panel";

const BOOLEAN_ITEMS = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

/** The value a box holds, or undefined when it is empty and so unset. */
function parseTextValue(field: WorkflowOutputField, text: string): unknown {
  if (text === "") return undefined;
  if (field.type === "number") {
    const number = Number(text);
    return Number.isNaN(number) ? text : number;
  }
  return text;
}

/** A box of no fixed type holds a list or an object when its text is one, and text otherwise. */
function parseUnknownValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}

function TestValueField({
  field,
  value,
  missing,
  projects,
  onChange,
}: {
  field: WorkflowOutputField;
  value: unknown;
  missing?: MissingTestValue["reason"];
  projects: readonly { id: string; name: string }[];
  onChange: (value: unknown) => void;
}) {
  const intl = useIntl();
  const [jsonError, setJsonError] = useState(false);
  const id = `vw-test-${field.path}`;
  const invalid = jsonError || missing !== undefined;
  const label = (
    <FieldLabel htmlFor={id} className="flex items-baseline gap-1.5">
      <span className="font-mono text-xs">{field.path}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {field.type}
        {field.optional ? ` · ${intl.formatMessage(messages.testDataOptional)}` : null}
      </span>
    </FieldLabel>
  );

  let control: ReactNode;
  if (field.path === "projectId" && projects.length > 0) {
    const items = projects.map((project) => ({ value: project.id, label: project.name }));
    const selected = items.find((item) => item.value === value);
    control = (
      <Select
        value={typeof value === "string" ? value : null}
        items={items}
        onValueChange={(next) => onChange(next ?? undefined)}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
          <SelectValue placeholder={intl.formatMessage(messages.testDataChooseProject)}>
            {selected?.label ?? (typeof value === "string" && value ? value : undefined)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "boolean") {
    control = (
      <Select
        value={typeof value === "boolean" ? String(value) : null}
        items={BOOLEAN_ITEMS}
        onValueChange={(next) => onChange(next === null ? undefined : next === "true")}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
          <SelectValue placeholder={intl.formatMessage(messages.testDataNotSet)} />
        </SelectTrigger>
        <SelectContent>
          {BOOLEAN_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "array" || field.type === "object") {
    control = (
      <Textarea
        id={id}
        key={JSON.stringify(value)}
        className="font-mono text-xs"
        aria-invalid={invalid}
        defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)}
        onBlur={(event) => {
          const text = event.target.value.trim();
          if (text === "") {
            setJsonError(false);
            onChange(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(text);
            const matches =
              field.type === "array"
                ? Array.isArray(parsed)
                : Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
            if (!matches) throw new Error("test_value_type_mismatch");
            setJsonError(false);
            onChange(parsed);
          } catch {
            setJsonError(true);
          }
        }}
      />
    );
  } else {
    control = (
      <Input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        aria-invalid={invalid}
        value={
          value === undefined
            ? ""
            : typeof value === "string"
              ? value
              : typeof value === "number"
                ? String(value)
                : JSON.stringify(value)
        }
        onChange={(event) => onChange(parseTextValue(field, event.target.value))}
        onBlur={(event) => {
          if (field.type !== "unknown") return;
          const parsed = parseUnknownValue(event.target.value);
          if (typeof parsed !== "string") onChange(parsed);
        }}
      />
    );
  }

  return (
    <Field data-invalid={invalid}>
      {label}
      {control}
      {jsonError ? (
        <FieldDescription>
          <FormattedMessage {...messages.testDataInvalidJson} />
        </FieldDescription>
      ) : missing ? (
        <FieldDescription>
          <FormattedMessage
            {...(missing === "required" ? messages.testDataNeeded : messages.testDataReadByStep)}
          />
        </FieldDescription>
      ) : null}
    </Field>
  );
}

/**
 * A step's Test tab: the values it uses in a test run, one box per output pin. A trigger's values
 * are its sample event; an action step's are what it returns in place of doing its work.
 */
export function WorkflowTestDataPanel({
  node,
  value,
  missing,
  projects,
  onChange,
}: {
  node: VisualWorkflowRfNode;
  value: Record<string, unknown> | undefined;
  /** The values of this step a test run needs and does not have. */
  missing: readonly MissingTestValue[];
  projects: readonly { id: string; name: string }[];
  onChange: (value: Record<string, unknown>) => void;
}) {
  const intl = useIntl();
  const data = value ?? {};
  const fields = getTestDataFields(node);
  const lastRun = testDataFromOutput(node, node.data.lastOutput);
  const missingByPath = new Map(missing.map((entry) => [entry.path, entry.reason]));
  // A value another step reads that is not one of the step's pins has no box of its own.
  const unlistedMissing = missing.filter(
    (entry) => !fields.some((field) => field.path === entry.path),
  );

  return (
    <FieldGroup className="gap-4">
      <p className="text-sm text-muted-foreground">
        <FormattedMessage
          {...(isTriggerType(node.data.catalogType)
            ? messages.testDataTriggerDescription
            : messages.testDataActionDescription)}
        />
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(exampleTestData(node, data))}
        >
          <FormattedMessage {...messages.testDataFillExamples} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!lastRun}
          onClick={() => lastRun && onChange(lastRun)}
        >
          <FormattedMessage {...messages.testDataUseLastRun} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={Object.keys(data).length === 0}
          onClick={() => onChange({})}
        >
          <FormattedMessage {...messages.testDataClear} />
        </Button>
      </div>
      {fields.map((field) => (
        <TestValueField
          key={field.path}
          field={field}
          value={readWorkflowPath(data, field.path.split("."))}
          missing={missingByPath.get(field.path)}
          projects={projects}
          onChange={(next) => onChange(withTestValue(data, field.path, next))}
        />
      ))}
      {unlistedMissing.map((entry) => (
        <TestValueField
          key={entry.path}
          field={{ path: entry.path, type: "unknown", optional: true }}
          value={undefined}
          missing={entry.reason}
          projects={projects}
          onChange={(next) => onChange(withTestValue(data, entry.path, next))}
        />
      ))}
      <WorkflowJsonField
        label={intl.formatMessage(messages.testDataJson)}
        value={data}
        validate={(next) => Boolean(next) && typeof next === "object" && !Array.isArray(next)}
        onChange={(next) => onChange(next as Record<string, unknown>)}
      />
    </FieldGroup>
  );
}
