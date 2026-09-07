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
import { describe, expect, it } from "vite-plus/test";

import { createEmptyVisualWorkflowDefinition } from "./schema/serializers";
import type { VisualWorkflowDefinition } from "./schema/types";
import { stampEmailNodePipesUsersOnDefinition } from "./stamp-email-node-pipes-users";

function emailDefinition(nodes: VisualWorkflowDefinition["nodes"]): VisualWorkflowDefinition {
  const definition = createEmptyVisualWorkflowDefinition("Email workflow");
  return {
    ...definition,
    nodes,
  };
}

describe("stampEmailNodePipesUsersOnDefinition", () => {
  it("stamps the actor WorkOS user on new email nodes", () => {
    const definition = emailDefinition([
      {
        id: "email-1",
        type: "action.notify_email",
        config: {
          kind: "action.notify_email",
          provider: "resend",
          from: "ops@example.com",
          recipients: "team@example.com",
          subject: "Hello",
          message: "Body",
        },
      },
    ]);

    const stamped = stampEmailNodePipesUsersOnDefinition({
      definition,
      actorWorkosUserId: "user_operator_b",
    });

    expect(stamped.nodes[0]?.config).toMatchObject({
      workosUserId: "user_operator_b",
    });
  });

  it("preserves the credential owner when another operator saves unrelated changes", () => {
    const previous = emailDefinition([
      {
        id: "email-1",
        type: "action.notify_email",
        config: {
          kind: "action.notify_email",
          provider: "resend",
          from: "ops@example.com",
          recipients: "team@example.com",
          subject: "Hello",
          message: "Body",
          workosUserId: "user_operator_b",
        },
      },
    ]);

    const next = emailDefinition([
      {
        id: "email-1",
        type: "action.notify_email",
        config: {
          kind: "action.notify_email",
          provider: "resend",
          from: "ops@example.com",
          recipients: "team@example.com",
          subject: "Hello",
          message: "Body",
        },
      },
    ]);

    const stamped = stampEmailNodePipesUsersOnDefinition({
      definition: next,
      previousDefinition: previous,
      actorWorkosUserId: "user_operator_a",
    });

    expect(stamped.nodes[0]?.config).toMatchObject({
      workosUserId: "user_operator_b",
    });
  });

  it("re-stamps the actor when the email node configuration changes", () => {
    const previous = emailDefinition([
      {
        id: "email-1",
        type: "action.notify_email",
        config: {
          kind: "action.notify_email",
          provider: "resend",
          from: "ops@example.com",
          recipients: "team@example.com",
          subject: "Hello",
          message: "Body",
          workosUserId: "user_operator_a",
        },
      },
    ]);

    const next = emailDefinition([
      {
        id: "email-1",
        type: "action.notify_email",
        config: {
          kind: "action.notify_email",
          provider: "sendgrid",
          from: "ops@example.com",
          recipients: "team@example.com",
          subject: "Hello",
          message: "Body",
        },
      },
    ]);

    const stamped = stampEmailNodePipesUsersOnDefinition({
      definition: next,
      previousDefinition: previous,
      actorWorkosUserId: "user_operator_b",
    });

    expect(stamped.nodes[0]?.config).toMatchObject({
      provider: "sendgrid",
      workosUserId: "user_operator_b",
    });
  });
});
