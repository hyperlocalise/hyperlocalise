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
import type {
  VisualConcatenateSegment,
  VisualTextMissingBehavior,
  VisualTextTemplatePlaceholder,
} from "../schema/types";
import { parseTextTemplate } from "../schema/text-template";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export const TEXT_NODE_LIMITS = { maxOutputBytes: 256_000 } as const;

type TextResult =
  | { ok: true; text: string }
  | { ok: false; code: string; message: string; inputId?: string };

function failure(
  code: string,
  message: string,
  extra?: { inputId?: string },
): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message, ...extra } };
}

function stringifyTextValue(value: unknown): TextResult {
  if (typeof value === "string") return { ok: true, text: value };
  if (typeof value === "boolean") return { ok: true, text: String(value) };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, text: String(value) };
  }
  if (value !== null && typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text === undefined
        ? { ok: false, code: "invalid_text_value", message: "Input cannot be converted to text." }
        : { ok: true, text };
    } catch {
      return {
        ok: false,
        code: "invalid_text_value",
        message: "Circular values cannot be converted to text.",
      };
    }
  }
  return { ok: false, code: "invalid_text_value", message: "Input cannot be converted to text." };
}

function resolveTextValue(input: {
  value: unknown;
  missingBehavior: VisualTextMissingBehavior;
  fallback?: string;
  label: string;
  inputId: string;
}): TextResult {
  const withId = (result: TextResult): TextResult =>
    result.ok ? result : { ...result, inputId: input.inputId };
  if (input.value !== undefined && input.value !== null) {
    return withId(stringifyTextValue(input.value));
  }
  switch (input.missingBehavior) {
    case "optional":
      return { ok: true, text: "" };
    case "fallback":
      return { ok: true, text: input.fallback ?? "" };
    case "required":
      return {
        ok: false,
        code: "missing_text_input",
        message: `Required text input "${input.label}" is missing.`,
        inputId: input.inputId,
      };
  }
}

class BoundedTextBuilder {
  readonly #parts: string[] = [];
  #bytes = 0;

  append(text: string): boolean {
    const bytes = new TextEncoder().encode(text).byteLength;
    if (this.#bytes + bytes > TEXT_NODE_LIMITS.maxOutputBytes) return false;
    this.#bytes += bytes;
    this.#parts.push(text);
    return true;
  }

  value(): string {
    return this.#parts.join("");
  }
}

function tooLarge(): VisualWorkflowNodeExecutionResult {
  return failure("text_output_too_large", "Text output exceeds the maximum size.");
}

function appendResolved(
  builder: BoundedTextBuilder,
  resolved: TextResult,
): VisualWorkflowNodeExecutionResult | undefined {
  if (!resolved.ok) return failure(resolved.code, resolved.message, { inputId: resolved.inputId });
  if (!builder.append(resolved.text)) return tooLarge();
  return undefined;
}

export function executeTextTemplate(input: {
  template: string;
  placeholders: readonly VisualTextTemplatePlaceholder[];
  resolvedConfig: Readonly<Record<string, unknown>>;
}): VisualWorkflowNodeExecutionResult {
  const parsed = parseTextTemplate(input.template);
  if (!parsed.valid) return failure("invalid_text_template", "Text template is malformed.");

  const placeholders = new Map(
    input.placeholders.map((placeholder) => [placeholder.name, placeholder]),
  );
  const builder = new BoundedTextBuilder();

  for (const token of parsed.tokens) {
    if (token.kind === "literal") {
      if (!builder.append(token.value)) return tooLarge();
      continue;
    }
    const placeholder = placeholders.get(token.name);
    if (!placeholder) {
      return failure(
        "unknown_text_placeholder",
        `Text placeholder "${token.name}" is not configured.`,
      );
    }
    const failed = appendResolved(
      builder,
      resolveTextValue({
        value: input.resolvedConfig[`value.${placeholder.id}`],
        missingBehavior: placeholder.missingBehavior,
        fallback: placeholder.fallback,
        label: placeholder.name,
        inputId: placeholder.id,
      }),
    );
    if (failed) return failed;
  }

  return { ok: true, output: { text: builder.value() } };
}

export function executeConcatenate(input: {
  segments: readonly VisualConcatenateSegment[];
  separator: string;
  resolvedConfig: Readonly<Record<string, unknown>>;
}): VisualWorkflowNodeExecutionResult {
  const builder = new BoundedTextBuilder();
  for (const [index, segment] of input.segments.entries()) {
    if (index > 0 && !builder.append(input.separator)) return tooLarge();
    if (segment.kind === "literal") {
      if (!builder.append(segment.value)) return tooLarge();
      continue;
    }
    const failed = appendResolved(
      builder,
      resolveTextValue({
        value: input.resolvedConfig[`value.${segment.id}`],
        missingBehavior: segment.missingBehavior,
        fallback: segment.fallback,
        label: segment.name,
        inputId: segment.id,
      }),
    );
    if (failed) return failed;
  }
  return { ok: true, output: { text: builder.value() } };
}
