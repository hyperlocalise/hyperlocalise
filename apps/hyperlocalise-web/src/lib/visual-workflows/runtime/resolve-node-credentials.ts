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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { WorkflowCredentialError } from "../workflow-credentials";
import type { CanonicalVisualWorkflowNode, WorkflowBinding } from "../schema/types";
import { setResolvedInput } from "./bindings";

export const MISSING_WORKFLOW_CREDENTIAL = {
  code: "workflow_credential_not_found",
  message: "Credential is missing or no longer available.",
} as const;

export async function resolveSelectedNodeCredentials(input: {
  organizationId: string;
  node: CanonicalVisualWorkflowNode;
  cache: Map<string, string>;
  resolve: (
    organizationId: string,
    credentialId: string,
  ) => Promise<Result<string, WorkflowCredentialError>>;
}): Promise<
  Result<
    { config: Record<string, unknown>; secrets: string[] },
    { code: "workflow_credential_not_found"; message: string }
  >
> {
  const config = { ...input.node.config } as Record<string, unknown>;
  const secrets: string[] = [];
  const bindings = Object.entries(input.node.inputs ?? {}).filter(
    (entry): entry is [string, Extract<WorkflowBinding, { kind: "secret" }>] =>
      entry[1].kind === "secret",
  );
  const authCredentialId =
    input.node.config.kind === "action.http" ? input.node.config.auth?.credentialId : undefined;
  const credentialIds = [
    ...bindings.map(([, binding]) => binding.credentialId),
    ...(authCredentialId ? [authCredentialId] : []),
  ];

  for (const credentialId of credentialIds) {
    let value = input.cache.get(credentialId);
    if (value === undefined) {
      const resolved = await input.resolve(input.organizationId, credentialId);
      if (isErr(resolved)) {
        return err({ ...MISSING_WORKFLOW_CREDENTIAL });
      }
      value = resolved.value;
      input.cache.set(credentialId, value);
    }
    secrets.push(value);
  }

  for (const [name, binding] of bindings) {
    setResolvedInput(config, name, input.cache.get(binding.credentialId)!);
  }
  if (input.node.config.kind === "action.http" && authCredentialId) {
    config.auth = {
      ...input.node.config.auth,
      token: input.cache.get(authCredentialId)!,
    };
  }

  return ok({ config, secrets });
}
