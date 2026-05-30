import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ResolvedIdentity } from "autumn-js/backend";
import { autumnHandler } from "autumn-js/hono";

import { forbiddenResponse } from "@/api/errors";
import { hasCapability } from "@/api/auth/policy";
import { createWorkosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  AUTUMN_API_PATH_PREFIX,
  getAutumnSecretKey,
  ORGANIZATION_SLUG_HEADER,
} from "@/lib/billing/autumn-config";
import { resolveAutumnCustomerIdentity } from "@/lib/billing/autumn-customer";
import {
  AUTUMN_BILLING_WRITE_ROUTE_NAMES,
  getAutumnRouteNameFromPath,
} from "@/lib/billing/autumn-route-access";
import { isErr } from "@/lib/primitives/result/results";

const requireBillingReadMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get("auth");
    if (!hasCapability(auth.membership.role, "billing:read")) {
      return forbiddenResponse(
        c,
        "billing_read_forbidden",
        "Billing settings require workspace owner or admin access",
      );
    }

    await next();
  },
);

const requireBillingWriteForRouteMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const routeName = getAutumnRouteNameFromPath(new URL(c.req.url).pathname);
    if (!isErr(routeName) && AUTUMN_BILLING_WRITE_ROUTE_NAMES.has(routeName.value)) {
      const auth = c.get("auth");
      if (!hasCapability(auth.membership.role, "billing:write")) {
        return forbiddenResponse(
          c,
          "billing_write_forbidden",
          "Only workspace owners and admins can change plans or open the billing portal",
        );
      }
    }

    await next();
  },
);

type AutumnVariables = AuthVariables & {
  autumnCustomerIdentity: ResolvedIdentity;
};

const requireBillableWorkspaceMiddleware = createMiddleware<{ Variables: AutumnVariables }>(
  async (c, next) => {
    const identity = resolveAutumnCustomerIdentity(c.get("auth"));
    if (isErr(identity)) {
      return forbiddenResponse(
        c,
        identity.error.code,
        "Billing is not available for this workspace",
      );
    }

    c.set("autumnCustomerIdentity", identity.value);
    await next();
  },
);

export function createAutumnRoutes() {
  const secretKey = getAutumnSecretKey();

  return new Hono<{ Variables: AutumnVariables }>()
    .use("*", createWorkosAuthMiddleware())
    .use("*", requireBillingReadMiddleware)
    .use("*", requireBillingWriteForRouteMiddleware)
    .use("*", requireBillableWorkspaceMiddleware)
    .use(
      "*",
      autumnHandler({
        secretKey,
        pathPrefix: AUTUMN_API_PATH_PREFIX,
        identify: (c) => c.get("autumnCustomerIdentity"),
      }),
    );
}

export { ORGANIZATION_SLUG_HEADER };
