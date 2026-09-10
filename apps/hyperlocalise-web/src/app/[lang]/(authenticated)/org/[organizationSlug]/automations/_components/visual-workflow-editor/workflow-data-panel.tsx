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
"use client";
import { WorkflowCredentialField } from "./workflow-credential-field";
import { useState } from "react";
import { useIntl } from "react-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getWorkflowOutputFields,
  NODE_CONTRACTS,
} from "@/lib/visual-workflows/catalog/node-contracts";
import type {
  VisualWorkflowRfNode,
  VisualWorkflowRfEdge,
  WorkflowNodeContract,
  WorkflowBinding,
} from "@/lib/visual-workflows/schema/types";
import { readWorkflowPath } from "@/lib/visual-workflows/runtime/bindings";
export function WorkflowDataPanel({
  node,
  nodes,
  edges,
  onChange,
  organizationSlug,
}: {
  node: VisualWorkflowRfNode;
  organizationSlug?: string;
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  onChange: (patch: WorkflowNodeContract) => void;
}) {
  const intl = useIntl();
  const [search, setSearch] = useState("");
  const [secretTarget, setSecretTarget] = useState("headers.X-API-Key");
  const upstream = new Set<string>();
  const queue = [node.id];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges.filter((edge) => edge.target === current))
      if (!upstream.has(edge.source)) {
        upstream.add(edge.source);
        queue.push(edge.source);
      }
  }
  const options = nodes
    .filter((candidate) => upstream.has(candidate.id))
    .flatMap((candidate) =>
      [
        ...getWorkflowOutputFields({
          id: candidate.id,
          type: candidate.data.catalogType,
          config: candidate.data.config,
          inputs: candidate.data.inputs,
          outputFields: candidate.data.outputFields,
        }).map((field) => ({ ...field, observed: false })),
        ...observedOutputFields(candidate.data.lastOutput).filter(
          (field) =>
            !getWorkflowOutputFields({
              id: candidate.id,
              type: candidate.data.catalogType,
              config: candidate.data.config,
              inputs: candidate.data.inputs,
              outputFields: candidate.data.outputFields,
            }).some((declared) => declared.path === field.path),
        ),
      ]
        .filter(
          (field) =>
            candidate.data.catalogType !== "logic.for_each" ||
            !["item", "index"].includes(field.path) ||
            candidate.data.bodyNodeIds?.includes(node.id),
        )
        .map((field) => ({
          nodeId: candidate.id,
          path: field.path
            .split(".")
            .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
          label: `${candidate.id} · ${field.path} (${field.type}${field.observed ? ", observed only" : field.optional ? ", optional" : ""})`,
          sample: readWorkflowPath(candidate.data.lastOutput, field.path.split(".")),
        })),
    );
  const contract = NODE_CONTRACTS[node.data.catalogType];
  const inputFields =
    node.data.config.kind === "logic.set"
      ? [
          ...new Set([
            ...node.data.config.assignments.map((assignment) => assignment.key),
            ...Object.keys(node.data.inputs ?? {}),
          ]),
        ]
          .filter(Boolean)
          .map((name) => ({ name, type: "unknown" as const, required: false }))
      : contract.inputs;
  const change = (name: string, binding: WorkflowBinding | undefined) => {
    const inputs = { ...node.data.inputs };
    if (binding) inputs[name] = binding;
    else delete inputs[name];
    onChange({ inputs });
  };
  return (
    <FieldGroup>
      <h3 className="text-sm font-medium">
        {intl.formatMessage({
          description: "Visual workflow editor control",
          id: "DoPyHmkOAP",
          defaultMessage: "Inputs",
        })}
      </h3>
      <Field>
        <FieldLabel htmlFor="workflow-field-search">
          {intl.formatMessage({
            description: "Visual workflow editor control",
            id: "CY0//qPgu1",
            defaultMessage: "Find upstream fields",
          })}
        </FieldLabel>
        <Input
          id="workflow-field-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      {inputFields.map((field) => {
        const binding = node.data.inputs?.[field.name];
        return (
          <Field key={field.name}>
            <FieldLabel>
              {field.name} · {field.type} {field.required ? "*" : ""}
            </FieldLabel>
            <Select
              value={binding?.kind ?? "configuration"}
              onValueChange={(value) => {
                if (value === "reference")
                  change(field.name, {
                    kind: "reference",
                    nodeId: options[0]?.nodeId ?? "$trigger",
                    path: options[0]?.path ?? [],
                  });
                else if (value === "literal") change(field.name, { kind: "literal", value: "" });
                else if (value === "template")
                  change(field.name, { kind: "template", template: "" });
                else change(field.name, undefined);
              }}
            >
              <SelectTrigger aria-label={field.name}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {["configuration", "reference", "literal", "template"].map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {binding?.kind === "reference" ? (
              <>
                <Select
                  value={JSON.stringify([binding.nodeId, binding.path])}
                  onValueChange={(value) => {
                    if (value) {
                      const [nodeId, path] = JSON.parse(value);
                      change(field.name, { ...binding, nodeId, path });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={intl.formatMessage({
                      description: "Visual workflow editor control",
                      id: "nOPkXXYDPf",
                      defaultMessage: "Source field",
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {options
                        .filter((option) =>
                          option.label.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((option) => (
                          <SelectItem
                            key={JSON.stringify([option.nodeId, option.path])}
                            value={JSON.stringify([option.nodeId, option.path])}
                          >
                            {option.label}
                            {option.sample !== undefined
                              ? ` · ${JSON.stringify(option.sample).slice(0, 80)}`
                              : ""}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  aria-label={intl.formatMessage({
                    description: "Visual workflow editor control",
                    id: "XLQ4My0c2z",
                    defaultMessage: "Field path",
                  })}
                  value={binding.path.join(".")}
                  onChange={(event) =>
                    change(field.name, {
                      ...binding,
                      path: event.target.value
                        .split(".")
                        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
                    })
                  }
                />
                <FieldDescription>
                  {intl.formatMessage({
                    description: "Visual workflow editor control",
                    id: "qtmhT9t6TF",
                    defaultMessage:
                      "Samples describe observed data. Unknown fields are checked at run time.",
                  })}
                </FieldDescription>
                <FieldLabel>
                  <Checkbox
                    checked={binding.optional ?? false}
                    onCheckedChange={(value) =>
                      change(field.name, { ...binding, optional: Boolean(value) })
                    }
                  />
                  {intl.formatMessage({
                    description: "Visual workflow editor control",
                    id: "KsKu3atOfj",
                    defaultMessage: "Allow missing value",
                  })}
                </FieldLabel>
                <WorkflowJsonField
                  label={intl.formatMessage({
                    description: "Visual workflow editor control",
                    id: "BezqwlCa/n",
                    defaultMessage: "Fallback value (JSON)",
                  })}
                  value={binding.fallback}
                  onChange={(fallback) => change(field.name, { ...binding, fallback })}
                />
              </>
            ) : binding?.kind === "literal" ? (
              <WorkflowJsonField
                label={field.name}
                value={binding.value}
                onChange={(value) => change(field.name, { ...binding, value })}
              />
            ) : binding?.kind === "template" ? (
              <Textarea
                aria-label={field.name}
                value={binding.template}
                onChange={(event) =>
                  change(field.name, { ...binding, template: event.target.value })
                }
              />
            ) : null}
          </Field>
        );
      })}
      {node.data.catalogType === "action.http" && organizationSlug ? (
        <Field>
          <FieldLabel>
            {intl.formatMessage({
              defaultMessage: "Secret field",
              id: "NkkzP9kJMz",
              description: "Workflow secret destination label",
            })}
          </FieldLabel>
          <Input
            aria-label={intl.formatMessage({
              defaultMessage: "Secret field path",
              id: "EH/CNk39Q2",
              description: "Workflow secret destination path",
            })}
            value={secretTarget}
            onChange={(event) => setSecretTarget(event.target.value)}
          />
          <FieldDescription>
            {intl.formatMessage({
              defaultMessage:
                "Use headers.X-API-Key or body.fieldName. The value is loaded only during live execution.",
              id: "Eja7ryRh39",
              description: "Workflow secret binding instructions",
            })}
          </FieldDescription>
          {/^(headers|body)\.[A-Za-z0-9_.-]+$/.test(secretTarget) ? (
            <WorkflowCredentialField
              organizationSlug={organizationSlug}
              value={
                node.data.inputs?.[secretTarget]?.kind === "secret"
                  ? (node.data.inputs[secretTarget] as Extract<WorkflowBinding, { kind: "secret" }>)
                      .credentialId
                  : undefined
              }
              onChange={(credentialId) => change(secretTarget, { kind: "secret", credentialId })}
            />
          ) : null}
        </Field>
      ) : null}
      {node.data.catalogType === "logic.for_each" ? (
        <>
          <Field>
            <FieldLabel>
              {intl.formatMessage({
                description: "Visual workflow editor control",
                id: "P7iGJ3MOIk",
                defaultMessage: "Nodes inside Each item",
              })}
            </FieldLabel>
            {nodes
              .filter(
                (candidate) =>
                  candidate.id !== node.id && !candidate.data.catalogType.startsWith("trigger."),
              )
              .map((candidate) => (
                <FieldLabel key={candidate.id}>
                  <Checkbox
                    checked={node.data.bodyNodeIds?.includes(candidate.id) ?? false}
                    onCheckedChange={(checked) =>
                      onChange({
                        bodyNodeIds: checked
                          ? [...(node.data.bodyNodeIds ?? []), candidate.id]
                          : (node.data.bodyNodeIds ?? []).filter((id) => id !== candidate.id),
                      })
                    }
                  />
                  {candidate.id}
                </FieldLabel>
              ))}
          </Field>
          <WorkflowJsonField
            label={intl.formatMessage({
              description: "Visual workflow editor control",
              id: "sUNtSb7xJe",
              defaultMessage: "Collected output bindings (JSON)",
            })}
            validate={(value) =>
              Boolean(value) && typeof value === "object" && !Array.isArray(value)
            }
            value={node.data.collect ?? {}}
            onChange={(value) => onChange({ collect: value as WorkflowNodeContract["collect"] })}
          />
        </>
      ) : null}
      <h3 className="text-sm font-medium">
        {intl.formatMessage({
          description: "Visual workflow editor control",
          id: "mqq6dTwRZM",
          defaultMessage: "Outputs",
        })}
      </h3>
      <WorkflowJsonField
        label={intl.formatMessage({
          description: "Visual workflow editor control",
          id: "Y4l3a1ThxU",
          defaultMessage: "Output fields (path, type, optional)",
        })}
        validate={(value) =>
          Array.isArray(value) &&
          value.every(
            (field) =>
              field &&
              typeof field === "object" &&
              typeof field.path === "string" &&
              ["string", "number", "boolean", "object", "array", "unknown"].includes(field.type),
          )
        }
        value={node.data.outputFields ?? contract.outputs}
        onChange={(value) =>
          onChange({ outputFields: value as WorkflowNodeContract["outputFields"] })
        }
      />
      {node.data.lastOutput ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(node.data.lastOutput, null, 2)}
        </pre>
      ) : null}
      {node.data.lastInput ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(node.data.lastInput, null, 2)}
        </pre>
      ) : null}
    </FieldGroup>
  );
}
export function WorkflowJsonField({
  label,
  value,
  onChange,
  validate,
}: {
  validate?: (value: unknown) => boolean;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [error, setError] = useState(false);
  const intl = useIntl();
  return (
    <Field data-invalid={error}>
      <FieldLabel>{label}</FieldLabel>
      <Textarea
        key={JSON.stringify(value)}
        aria-label={label}
        aria-invalid={error}
        defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)}
        onBlur={(event) => {
          try {
            const parsed = JSON.parse(event.target.value);
            if (validate && !validate(parsed)) throw new Error("invalid_json_shape");
            onChange(parsed);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      />
      {error ? (
        <FieldDescription>
          {intl.formatMessage({
            description: "Visual workflow editor control",
            id: "c/AGJRFp4G",
            defaultMessage: "Enter valid JSON.",
          })}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

function observedOutputFields(value: unknown) {
  const fields: { path: string; type: string; optional: boolean; observed: boolean }[] = [];
  const visit = (current: unknown, path: string[], depth: number) => {
    if (depth > 4 || fields.length >= 50 || !current || typeof current !== "object") return;
    for (const [key, entry] of Object.entries(current)) {
      if (fields.length >= 50) break;
      const next = [...path, key];
      fields.push({
        path: next.join("."),
        type: Array.isArray(entry) ? "array" : entry === null ? "unknown" : typeof entry,
        optional: true,
        observed: true,
      });
      visit(entry, next, depth + 1);
    }
  };
  visit(value, [], 0);
  return fields;
}
