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
  GoSvcRequestOptions,
  ProjectTemplateBody,
  ProjectTemplateRecord,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

/** Project templates on go-svc's `/v1/orgs/{slug}/project-templates`. */
export class GoSvcProjectTemplateApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projectTemplates: ProjectTemplateRecord[] }>(
      orgPath(organizationSlug, "project-templates"),
      options,
    );
  }

  get(organizationSlug: string, templateId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projectTemplate: ProjectTemplateRecord }>(
      orgPath(organizationSlug, "project-templates", templateId),
      options,
    );
  }

  /** Creates a template. With `fromProjectId`, it copies that project's settings first. */
  create(
    organizationSlug: string,
    body: ProjectTemplateBody & { fromProjectId?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projectTemplate: ProjectTemplateRecord }>(
      orgPath(organizationSlug, "project-templates"),
      { method: "POST", body, ...options },
    );
  }

  update(
    organizationSlug: string,
    templateId: string,
    body: ProjectTemplateBody,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projectTemplate: ProjectTemplateRecord }>(
      orgPath(organizationSlug, "project-templates", templateId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(organizationSlug: string, templateId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "project-templates", templateId), {
      method: "DELETE",
      ...options,
    });
  }
}
