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
import type { VisualCatalogType } from "../schema/types";

/**
 * What each node is, in plain English, for the assistant's prompt. The node picker shows the
 * person the same words through its localised messages (`visual-workflow-editor.messages.ts`);
 * these are kept here because that file is client-only and the prompt is built on the server.
 */
export const VISUAL_NODE_DESCRIPTIONS: Record<
  VisualCatalogType,
  { title: string; purpose: string }
> = {
  "trigger.manual": { title: "Manual trigger", purpose: "Start this workflow on demand." },
  "trigger.scheduled": { title: "Schedule", purpose: "Run on a recurring schedule." },
  "trigger.github": { title: "GitHub", purpose: "Start when a repository event occurs." },
  "trigger.source_upload": {
    title: "Source upload",
    purpose: "Start when a source file is uploaded.",
  },
  "action.http": { title: "HTTP Request", purpose: "Call an HTTP endpoint." },
  "action.content_sync": {
    title: "Content sync",
    purpose: "Pull source files into a project and push ready translations back.",
  },
  "action.notify_slack": { title: "Notify Slack", purpose: "Send a Slack message to a channel." },
  "action.notify_email": {
    title: "Send email",
    purpose: "Send a transactional email through Resend or SendGrid.",
  },
  "logic.if": { title: "If", purpose: "Branch on a condition." },
  "logic.switch": { title: "Switch", purpose: "Route to one of several branches." },
  "logic.set": { title: "Set fields", purpose: "Assign values into the workflow context." },
  "ai.agent": { title: "AI Agent", purpose: "Placeholder agent step with tools." },
  "logic.for_each": { title: "Loop", purpose: "Iterate over a collection sequentially." },
  "logic.retry": { title: "Retry", purpose: "Re-run a body region with backoff." },
  "flow.wait": { title: "Wait", purpose: "Pause until a duration, timestamp, or condition." },
  "flow.stop": {
    title: "Stop workflow",
    purpose: "Complete or intentionally cancel this workflow.",
  },
  "flow.return": {
    title: "Return outputs",
    purpose: "Complete this workflow with declared typed outputs.",
  },
  "flow.fail": {
    title: "Fail workflow",
    purpose: "Stop with a controlled error code and safe message.",
  },
  "logic.merge": { title: "Merge", purpose: "Coordinate multiple incoming execution paths." },
  "logic.sequence": {
    title: "Sequence",
    purpose: "Dispatch execution paths in a configured order.",
  },
  "logic.try_catch": {
    title: "Try / Catch",
    purpose: "Handle failures from a bounded execution region.",
  },
  "flow.call_workflow": {
    title: "Call workflow",
    purpose: "Run a published version of another workflow and use what it returns.",
  },
};
