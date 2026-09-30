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
import {
  GoSvcClientError,
  orgPath,
  type GoSvcJsonRequest,
  type GoSvcRequest,
} from "./go-svc-request";

type RpcArgs = { param: Record<string, string>; json?: unknown };

type RpcCollection = {
  $get: (args: RpcArgs) => Promise<Response>;
  $post: (args: RpcArgs) => Promise<Response>;
};

type RpcResource = {
  $get: (args: RpcArgs) => Promise<Response>;
  $put: (args: RpcArgs) => Promise<Response>;
  $delete: (args: RpcArgs) => Promise<Response>;
};

export type HyperlabGoSvcClient = {
  flags: RpcCollection & {
    [":flagId"]: RpcResource & {
      config: { $put: (args: RpcArgs) => Promise<Response> };
    };
  };
  audiences: RpcCollection & {
    [":audienceId"]: RpcResource;
  };
  experiments: RpcCollection & {
    [":experimentId"]: RpcResource & {
      rollouts: { $put: (args: RpcArgs) => Promise<Response> };
      variants: { $post: (args: RpcArgs) => Promise<Response> };
    };
  };
  assignments: RpcCollection & {
    [":assignmentId"]: RpcResource;
  };
  keys: RpcCollection & {
    [":keyId"]: RpcResource;
  };
  variants: {
    [":variantId"]: RpcResource;
  };
};

function hyperPath(organizationSlug: string, ...segments: string[]) {
  return orgPath(organizationSlug, "hyperlab", ...segments);
}

function errorResponse(error: GoSvcClientError): Response {
  return new Response(
    JSON.stringify({
      error: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    }),
    { status: error.status ?? 500, headers: { "Content-Type": "application/json" } },
  );
}

async function invoke(
  request: GoSvcRequest,
  path: string,
  init: GoSvcJsonRequest = {},
): Promise<Response> {
  try {
    return await request.response(path, init);
  } catch (error) {
    if (error instanceof GoSvcClientError) {
      return errorResponse(error);
    }
    throw error;
  }
}

function collection(request: GoSvcRequest, segment: string): RpcCollection {
  return {
    $get: ({ param }: RpcArgs) => invoke(request, hyperPath(param.organizationSlug, segment)),
    $post: ({ param, json }: RpcArgs) =>
      invoke(request, hyperPath(param.organizationSlug, segment), { method: "POST", body: json }),
  };
}

function resource(request: GoSvcRequest, segment: string, idKey: string): RpcResource {
  return {
    $get: ({ param }: RpcArgs) =>
      invoke(request, hyperPath(param.organizationSlug, segment, param[idKey]!)),
    $put: ({ param, json }: RpcArgs) =>
      invoke(request, hyperPath(param.organizationSlug, segment, param[idKey]!), {
        method: "PUT",
        body: json,
      }),
    $delete: ({ param }: RpcArgs) =>
      invoke(request, hyperPath(param.organizationSlug, segment, param[idKey]!), {
        method: "DELETE",
      }),
  };
}

export function createHyperlabGoSvcClient(request: GoSvcRequest): HyperlabGoSvcClient {
  return {
    flags: {
      ...collection(request, "flags"),
      [":flagId"]: {
        ...resource(request, "flags", "flagId"),
        config: {
          $put: ({ param, json }: RpcArgs) =>
            invoke(request, hyperPath(param.organizationSlug, "flags", param.flagId!, "config"), {
              method: "PUT",
              body: json,
            }),
        },
      },
    },
    audiences: {
      ...collection(request, "audiences"),
      [":audienceId"]: resource(request, "audiences", "audienceId"),
    },
    experiments: {
      ...collection(request, "experiments"),
      [":experimentId"]: {
        ...resource(request, "experiments", "experimentId"),
        rollouts: {
          $put: ({ param, json }: RpcArgs) =>
            invoke(
              request,
              hyperPath(param.organizationSlug, "experiments", param.experimentId!, "rollouts"),
              { method: "PUT", body: json },
            ),
        },
        variants: {
          $post: ({ param, json }: RpcArgs) =>
            invoke(
              request,
              hyperPath(param.organizationSlug, "experiments", param.experimentId!, "variants"),
              { method: "POST", body: json },
            ),
        },
      },
    },
    assignments: {
      ...collection(request, "assignments"),
      [":assignmentId"]: resource(request, "assignments", "assignmentId"),
    },
    keys: {
      ...collection(request, "keys"),
      [":keyId"]: resource(request, "keys", "keyId"),
    },
    variants: {
      [":variantId"]: resource(request, "variants", "variantId"),
    },
  };
}
