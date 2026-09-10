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
import { z } from "zod";
import type { WorkflowOutputField } from "../schema/types";
type FieldTree = { field?: WorkflowOutputField; children: Map<string, FieldTree> };
export function workflowStructuredOutputSchema(fields: readonly WorkflowOutputField[]) {
  const root: FieldTree = { children: new Map() };
  for (const field of fields.filter((field) => field.path.startsWith("json."))) {
    let current = root;
    for (const key of field.path.slice(5).split(".")) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("invalid_output_path");
      if (!current.children.has(key)) current.children.set(key, { children: new Map() });
      current = current.children.get(key)!;
    }
    current.field = field;
  }
  const build = (tree: FieldTree): z.ZodType => {
    let schema: z.ZodType;
    if (tree.children.size)
      schema = z.object(
        Object.fromEntries([...tree.children].map(([key, child]) => [key, build(child)])),
      );
    else
      switch (tree.field?.type) {
        case "string":
          schema = z.string();
          break;
        case "number":
          schema = z.number();
          break;
        case "boolean":
          schema = z.boolean();
          break;
        case "array":
          schema = z.array(z.unknown());
          break;
        case "object":
          schema = z.record(z.string(), z.unknown());
          break;
        default:
          schema = z.unknown();
      }
    return tree.field?.optional ? schema.optional() : schema;
  };
  return z.object(
    Object.fromEntries([...root.children].map(([key, child]) => [key, build(child)])),
  );
}
