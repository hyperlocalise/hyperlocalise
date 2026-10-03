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

// Vercel does not interpolate one environment variable inside another. Set
// deployment-derived tags before dd-trace initializes, while still allowing an
// operator to override either value explicitly.
if (!process.env.DD_ENV && process.env.VERCEL_ENV) {
  process.env.DD_ENV = process.env.VERCEL_ENV;
}
if (!process.env.DD_VERSION && process.env.VERCEL_GIT_COMMIT_SHA) {
  process.env.DD_VERSION = process.env.VERCEL_GIT_COMMIT_SHA;
}

await import("dd-trace/initialize.mjs");

const [{ default: tracer }, { redactLlmObsContent }] = await Promise.all([
  import("dd-trace"),
  import("./datadog-content-policy.mjs"),
]);

// The AI SDK policy suppresses content before telemetry events are emitted.
// This processor is the final fail-closed boundary before LLMObs export.
tracer.llmobs.registerProcessor(redactLlmObsContent);
