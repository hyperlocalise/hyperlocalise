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
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SUPPORTED_SCHEMA_KEYS = new Set([
  "$schema",
  "type",
  "properties",
  "required",
  "items",
  "additionalProperties",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);

export const JSON_NODE_LIMITS = {
  maxBytes: 256_000,
  maxDepth: 32,
  maxEntries: 10_000,
  maxErrors: 50,
} as const;

type JsonErrorDetail = { code: string; message: string; path: string };
type BoundedValueResult = { ok: true; value: unknown } | { ok: false; error: JsonErrorDetail };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function detail(code: string, message: string, path = "$"): JsonErrorDetail {
  return { code, message, path: path.slice(0, 256) };
}

function branchFailure(
  branch: "invalid" | "error",
  error: JsonErrorDetail,
): VisualWorkflowNodeExecutionResult {
  return { ok: true, output: { error }, switchCase: branch };
}

function cloneBoundedJson(value: unknown): BoundedValueResult {
  let entries = 0;
  const ancestors = new WeakSet<object>();

  const clone = (candidate: unknown, depth: number, path: string): BoundedValueResult => {
    if (depth > JSON_NODE_LIMITS.maxDepth)
      return {
        ok: false,
        error: detail("json_too_deep", "JSON value exceeds the maximum nesting depth.", path),
      };
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return { ok: true, value: candidate };
    if (typeof candidate === "number")
      return Number.isFinite(candidate)
        ? { ok: true, value: candidate }
        : {
            ok: false,
            error: detail("invalid_json_value", "JSON numbers must be finite.", path),
          };
    if (typeof candidate !== "object")
      return {
        ok: false,
        error: detail("invalid_json_value", "Value is not JSON-compatible.", path),
      };
    if (ancestors.has(candidate))
      return {
        ok: false,
        error: detail("circular_json_value", "JSON values cannot contain cycles.", path),
      };
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    )
      return {
        ok: false,
        error: detail("invalid_json_value", "JSON objects must use a plain prototype.", path),
      };

    ancestors.add(candidate);
    const cloned: unknown[] | Record<string, unknown> = Array.isArray(candidate) ? [] : {};
    for (const [key, child] of Object.entries(candidate)) {
      entries += 1;
      const childPath = Array.isArray(candidate) ? `${path}[${key}]` : `${path}.${key}`;
      if (entries > JSON_NODE_LIMITS.maxEntries) {
        ancestors.delete(candidate);
        return {
          ok: false,
          error: detail("json_too_large", "JSON value contains too many entries.", childPath),
        };
      }
      if (!Array.isArray(candidate) && UNSAFE_KEYS.has(key)) {
        ancestors.delete(candidate);
        return {
          ok: false,
          error: detail(
            "unsafe_json_key",
            "JSON object keys cannot modify object prototypes.",
            childPath,
          ),
        };
      }
      const result = clone(child, depth + 1, childPath);
      if (!result.ok) {
        ancestors.delete(candidate);
        return result;
      }
      if (Array.isArray(cloned)) cloned.push(result.value);
      else
        Object.defineProperty(cloned, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: result.value,
        });
    }
    ancestors.delete(candidate);
    return { ok: true, value: cloned };
  };

  const result = clone(value, 0, "$");
  if (!result.ok) return result;
  const serialized = JSON.stringify(result.value);
  return byteLength(serialized) <= JSON_NODE_LIMITS.maxBytes
    ? result
    : {
        ok: false,
        error: detail("json_too_large", "JSON value exceeds the size limit."),
      };
}

export function executeJsonParse(text: string): VisualWorkflowNodeExecutionResult {
  if (typeof text !== "string")
    return branchFailure("invalid", detail("invalid_json_text", "JSON input must be text."));
  if (byteLength(text) > JSON_NODE_LIMITS.maxBytes)
    return branchFailure("invalid", detail("json_too_large", "JSON text exceeds the size limit."));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return branchFailure("invalid", detail("invalid_json_syntax", "JSON text is not valid."));
  }

  const bounded = cloneBoundedJson(parsed);
  if (!bounded.ok) return branchFailure("invalid", bounded.error);
  return { ok: true, output: { value: bounded.value }, switchCase: "success" };
}

export function executeJsonStringify(value: unknown): VisualWorkflowNodeExecutionResult {
  const bounded = cloneBoundedJson(value);
  if (!bounded.ok) return branchFailure("error", bounded.error);

  const text = JSON.stringify(bounded.value);
  if (text === undefined)
    return branchFailure("error", detail("invalid_json_value", "Value is not JSON-compatible."));
  if (byteLength(text) > JSON_NODE_LIMITS.maxBytes)
    return branchFailure(
      "error",
      detail("json_too_large", "Serialized JSON exceeds the size limit."),
    );
  return { ok: true, output: { text }, switchCase: "success" };
}

function matchesType(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((entry) => matchesType(value, entry));
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return false;
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateSchemaShape(schema: unknown): BoundedValueResult {
  const bounded = cloneBoundedJson(schema);
  if (!bounded.ok) return bounded;
  if (bounded.value === null || typeof bounded.value !== "object" || Array.isArray(bounded.value))
    return {
      ok: false,
      error: detail("invalid_json_schema", "JSON schema must be an object."),
    };

  const visit = (candidate: unknown, path: string): JsonErrorDetail | null => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate))
      return detail("invalid_json_schema", "Schema entries must be objects.", path);
    for (const [key, entry] of Object.entries(candidate)) {
      if (key === "$ref" || key === "$dynamicRef")
        return detail("schema_reference_forbidden", "Schema references are not supported.", path);
      if (!SUPPORTED_SCHEMA_KEYS.has(key))
        return detail(
          "unsupported_schema_keyword",
          "Schema contains an unsupported keyword.",
          path,
        );
      if (key === "type") {
        const types = Array.isArray(entry) ? entry : [entry];
        if (
          types.length === 0 ||
          types.some(
            (type) =>
              typeof type !== "string" ||
              !["null", "boolean", "number", "integer", "string", "array", "object"].includes(type),
          )
        )
          return detail("invalid_json_schema", "Schema type is not valid.", `${path}.type`);
      }
      if (
        key === "required" &&
        (!Array.isArray(entry) || entry.some((required) => typeof required !== "string"))
      )
        return detail(
          "invalid_json_schema",
          "Schema required must be an array of property names.",
          `${path}.required`,
        );
      if (key === "enum" && !Array.isArray(entry))
        return detail("invalid_json_schema", "Schema enum must be an array.", `${path}.enum`);
      if (
        ["minimum", "maximum"].includes(key) &&
        (typeof entry !== "number" || !Number.isFinite(entry))
      )
        return detail("invalid_json_schema", "Schema limit is not valid.", `${path}.${key}`);
      if (
        ["minLength", "maxLength", "minItems", "maxItems"].includes(key) &&
        (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0)
      )
        return detail("invalid_json_schema", "Schema size limit is not valid.", `${path}.${key}`);
      if (key === "properties") {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry))
          return detail("invalid_json_schema", "Schema properties must be an object.", path);
        for (const [property, propertySchema] of Object.entries(entry)) {
          const invalid = visit(propertySchema, `${path}.properties.${property}`);
          if (invalid) return invalid;
        }
      }
      if (key === "items") {
        const invalid = visit(entry, `${path}.items`);
        if (invalid) return invalid;
      }
      if (key === "additionalProperties" && typeof entry !== "boolean") {
        const invalid = visit(entry, `${path}.additionalProperties`);
        if (invalid) return invalid;
      }
    }
    return null;
  };

  const invalid = visit(bounded.value, "$");
  return invalid ? { ok: false, error: invalid } : bounded;
}

function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: JsonErrorDetail[],
): void {
  if (errors.length >= JSON_NODE_LIMITS.maxErrors) return;
  const add = (code: string, message: string) => {
    if (errors.length < JSON_NODE_LIMITS.maxErrors) errors.push(detail(code, message, path));
  };

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    add("schema_type_mismatch", "Value does not match the required type.");
    return;
  }
  if (schema.const !== undefined && !sameJsonValue(value, schema.const))
    add("schema_const_mismatch", "Value does not match the required constant.");
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => sameJsonValue(value, entry)))
    add("schema_enum_mismatch", "Value is not one of the allowed values.");

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      add("schema_min_length", "String is shorter than the allowed minimum.");
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
      add("schema_max_length", "String exceeds the allowed maximum length.");
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      add("schema_minimum", "Number is below the allowed minimum.");
    if (typeof schema.maximum === "number" && value > schema.maximum)
      add("schema_maximum", "Number exceeds the allowed maximum.");
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      add("schema_min_items", "Array has fewer items than allowed.");
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      add("schema_max_items", "Array has more items than allowed.");
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items))
      value.forEach((entry, index) =>
        validateValue(entry, schema.items as Record<string, unknown>, `${path}[${index}]`, errors),
      );
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required === "string" && !Object.hasOwn(object, required))
          errors.push(
            detail("schema_required", "Required property is missing.", `${path}.${required}`),
          );
        if (errors.length >= JSON_NODE_LIMITS.maxErrors) return;
      }
    }
    for (const [key, entry] of Object.entries(object)) {
      const propertySchema = properties[key];
      if (propertySchema && typeof propertySchema === "object" && !Array.isArray(propertySchema))
        validateValue(entry, propertySchema as Record<string, unknown>, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false)
        errors.push(
          detail(
            "schema_additional_property",
            "Additional property is not allowed.",
            `${path}.${key}`,
          ),
        );
      if (errors.length >= JSON_NODE_LIMITS.maxErrors) return;
    }
  }
}

export function executeSchemaValidate(
  value: unknown,
  schema: unknown,
): VisualWorkflowNodeExecutionResult {
  const boundedValue = cloneBoundedJson(value);
  if (!boundedValue.ok)
    return {
      ok: true,
      output: { value: null, valid: false, errors: [boundedValue.error] },
      switchCase: "invalid",
    };
  const boundedSchema = validateSchemaShape(schema);
  if (!boundedSchema.ok)
    return {
      ok: true,
      output: { value: boundedValue.value, valid: false, errors: [boundedSchema.error] },
      switchCase: "invalid",
    };

  const errors: JsonErrorDetail[] = [];
  validateValue(boundedValue.value, boundedSchema.value as Record<string, unknown>, "$", errors);
  return errors.length === 0
    ? {
        ok: true,
        output: { value: boundedValue.value, valid: true, errors: [] },
        switchCase: "success",
      }
    : {
        ok: true,
        output: { value: boundedValue.value, valid: false, errors },
        switchCase: "invalid",
      };
}
