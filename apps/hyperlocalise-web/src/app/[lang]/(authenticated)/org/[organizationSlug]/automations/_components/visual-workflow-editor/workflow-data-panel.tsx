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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { NODE_CONTRACTS } from "@/lib/visual-workflows/catalog/node-contracts";
import type {
  VisualWorkflowRfNode,
  VisualWorkflowRfEdge,
  WorkflowNodeContract,
  WorkflowBinding,
} from "@/lib/visual-workflows/schema/types";
import { computeForEachBodyNodeIds } from "@/lib/visual-workflows/editor/for-each-body-membership";
const HTTP_SECRET_BINDING_PATH = /^(headers|body)\.[A-Za-z0-9_.-]+$/;

export function listHttpSecretBindings(
  inputs: Record<string, WorkflowBinding> | undefined,
): Array<[string, Extract<WorkflowBinding, { kind: "secret" }>]> {
  return Object.entries(inputs ?? {}).flatMap(([name, binding]) =>
    binding.kind === "secret" && HTTP_SECRET_BINDING_PATH.test(name)
      ? [[name, binding] as [string, Extract<WorkflowBinding, { kind: "secret" }>]]
      : [],
  );
}

export function upsertHttpSecretBinding(input: {
  inputs: Record<string, WorkflowBinding> | undefined;
  target: string;
  credentialId: string;
}): Record<string, WorkflowBinding> {
  const inputs = { ...input.inputs };
  const previousSecrets = listHttpSecretBindings(inputs);
  const previousTarget =
    previousSecrets.length === 1 && previousSecrets[0][0] !== input.target
      ? previousSecrets[0][0]
      : undefined;
  if (previousTarget) delete inputs[previousTarget];
  inputs[input.target] = { kind: "secret", credentialId: input.credentialId };
  return inputs;
}

/**
 * The parts of a step's inputs and outputs that its own form does not show: a saved credential in
 * an HTTP header or body, a loop's or retry's body steps, and the step's declared outputs.
 */
export function WorkflowDataPanel({
  node,
  nodes,
  edges,
  onChange,
  organizationSlug,
  section,
}: {
  node: VisualWorkflowRfNode;
  organizationSlug?: string;
  section: "settings" | "outputs";
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  onChange: (patch: WorkflowNodeContract) => void;
}) {
  const intl = useIntl();
  const [secretTarget, setSecretTarget] = useState("headers.X-API-Key");
  const contract = NODE_CONTRACTS[node.data.catalogType];
  const removeInput = (name: string) => {
    const inputs = { ...node.data.inputs };
    delete inputs[name];
    onChange({ inputs });
  };
  const forEachBodyNodeIds =
    node.data.catalogType === "logic.for_each" ? computeForEachBodyNodeIds(node.id, edges) : [];
  const hasBody =
    node.data.catalogType === "logic.for_each" || node.data.catalogType === "logic.retry";
  const hasSecretField = node.data.catalogType === "action.http" && Boolean(organizationSlug);
  if (section === "settings") {
    if (!hasSecretField && !hasBody) return null;
    return (
      <FieldGroup>
        {hasSecretField && organizationSlug ? (
          <Field>
            <FieldLabel>
              {intl.formatMessage({
                defaultMessage: "Secret field",
                id: "NkkzP9kJMz",
                description: "Workflow secret destination label",
              })}
            </FieldLabel>
            {listHttpSecretBindings(node.data.inputs).map(([name]) => (
              <div key={name} className="flex items-center justify-between gap-2">
                <span className="text-sm">{name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeInput(name)}>
                  {intl.formatMessage({
                    defaultMessage: "Remove",
                    id: "b9xdOWPMtl",
                    description: "Remove a workflow secret binding",
                  })}
                </Button>
              </div>
            ))}
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
            {HTTP_SECRET_BINDING_PATH.test(secretTarget) ? (
              <WorkflowCredentialField
                organizationSlug={organizationSlug}
                value={
                  node.data.inputs?.[secretTarget]?.kind === "secret"
                    ? (
                        node.data.inputs[secretTarget] as Extract<
                          WorkflowBinding,
                          { kind: "secret" }
                        >
                      ).credentialId
                    : undefined
                }
                onChange={(credentialId) =>
                  onChange({
                    inputs: upsertHttpSecretBinding({
                      inputs: node.data.inputs,
                      target: secretTarget,
                      credentialId,
                    }),
                  })
                }
              />
            ) : null}
          </Field>
        ) : null}
        {node.data.catalogType === "logic.for_each" ? (
          <Field>
            <FieldLabel>
              {intl.formatMessage({
                description: "Visual workflow editor control",
                id: "P7iGJ3MOIk",
                defaultMessage: "Nodes inside Each item",
              })}
            </FieldLabel>

            <FieldDescription>
              {intl.formatMessage({
                description: "Explanation of graph-derived For Each membership",
                id: "3OlJR3Fxjp",
                defaultMessage:
                  "Loop membership is derived automatically from connections leaving the Each item port.",
              })}
            </FieldDescription>

            {forEachBodyNodeIds.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {forEachBodyNodeIds.map((bodyNodeId) => (
                  <li key={bodyNodeId}>{bodyNodeId}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                {intl.formatMessage({
                  description: "Empty graph-derived For Each body",
                  id: "yIZkW24JC2",
                  defaultMessage: "No nodes are connected to the Each item region.",
                })}
              </p>
            )}
          </Field>
        ) : null}

        {node.data.catalogType === "logic.retry" ? (
          <Field>
            <FieldLabel>
              {intl.formatMessage({
                description: "Visual workflow editor control",
                id: "cpyaLTW85o",
                defaultMessage: "Nodes inside Attempt",
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
        ) : null}
      </FieldGroup>
    );
  }
  return (
    <FieldGroup>
      {hasBody ? (
        <WorkflowJsonField
          label={intl.formatMessage({
            description: "Visual workflow editor control",
            id: "sUNtSb7xJe",
            defaultMessage: "Collected output bindings (JSON)",
          })}
          validate={(value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)}
          value={node.data.collect ?? {}}
          onChange={(value) =>
            onChange({
              collect: value as WorkflowNodeContract["collect"],
            })
          }
        />
      ) : null}
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
