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
import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  verifyLinkedDomainChallengeMock: vi.fn(),
  workspaceDomainsFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/linked-domains/verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/linked-domains/verify")>();
  return {
    ...actual,
    verifyLinkedDomainChallenge: mocks.verifyLinkedDomainChallengeMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceDomainsFlag: { run: mocks.workspaceDomainsFlagRunMock },
  };
});

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { hostnameToDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { ok } from "@/lib/primitives/result/results";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

async function insertSucceededAudit(domainKey: string) {
  const domainSlug = hostnameToDomainSlug(domainKey);
  const completedAt = new Date().toISOString();
  const [audit] = await db
    .insert(schema.localisationAudits)
    .values({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      status: "succeeded",
      score: 72,
      teaser: {
        score: 72,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt,
      },
      report: {
        score: 72,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt,
      },
      completedAt: new Date(),
    })
    .returning();
  return audit;
}

describe("linkedDomainRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.workspaceDomainsFlagRunMock.mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("denies linked domain access when the feature flag is disabled", async () => {
    mocks.workspaceDomainsFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"].$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });

  it("starts verifies and lists a linked domain claim", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    expect(organizationId).toBeTruthy();
    const domainKey = `claim-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);

    mocks.verifyLinkedDomainChallengeMock.mockResolvedValue(ok({ method: "dns_txt" }));

    const createResponse = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      linkedDomain: {
        domainKey,
        status: "pending_verification",
        localisationAuditId: audit.id,
      },
    });
    if (!("linkedDomain" in created)) {
      throw new Error("expected linkedDomain in create response");
    }

    const linkedDomainId = created.linkedDomain.id;

    const verifyResponse = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].verify.$post(
      {
        param: { organizationSlug, linkedDomainId },
        json: { method: "dns_txt", createProject: true },
      },
      { headers },
    );

    expect(verifyResponse.status).toBe(200);
    const verified = await verifyResponse.json();
    if (!("linkedDomain" in verified)) {
      throw new Error("expected linkedDomain in verify response");
    }
    expect(verified.linkedDomain.status).toBe("verified");
    expect(verified.linkedDomain.projectId).toMatch(/^project_/);
    expect(verified.linkedDomain.verifiedMethod).toBe("dns_txt");

    const [auditRow] = await db
      .select()
      .from(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, audit.id))
      .limit(1);
    expect(auditRow.organizationId).toBe(organizationId);
    expect(auditRow.linkedDomainId).toBe(linkedDomainId);

    const listResponse = await client.api.orgs[":organizationSlug"]["linked-domains"].$get(
      { param: { organizationSlug } },
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    if (!("linkedDomains" in listed)) {
      throw new Error("expected linkedDomains in list response");
    }
    expect(listed.linkedDomains.some((row) => row.id === linkedDomainId)).toBe(true);
    const listedDomain = listed.linkedDomains.find((row) => row.id === linkedDomainId);
    expect(listedDomain?.auditScore).toBe(72);

    const auditResponse = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].audit.$get(
      {
        param: { organizationSlug, linkedDomainId },
      },
      { headers },
    );
    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.json();
    if (!("audit" in auditBody)) {
      throw new Error("expected audit in audit response");
    }
    expect(auditBody.audit).toMatchObject({
      id: audit.id,
      domainKey,
      score: 72,
    });
    expect(auditBody.audit.report).not.toBeNull();

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("does not return the full audit report for a pending claim", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const domainKey = `pending-audit-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);

    const createResponse = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    if (!("linkedDomain" in created)) {
      throw new Error("expected linkedDomain in create response");
    }
    expect(created.linkedDomain.status).toBe("pending_verification");

    const auditResponse = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].audit.$get(
      {
        param: { organizationSlug, linkedDomainId: created.linkedDomain.id },
      },
      { headers },
    );
    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.json();
    if (!("audit" in auditBody)) {
      throw new Error("expected audit in audit response");
    }
    expect(auditBody.audit.id).toBe(audit.id);
    expect(auditBody.audit.teaser).not.toBeNull();
    expect(auditBody.audit.report).toBeNull();

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("rejects a second org claiming an already verified domain", async () => {
    const first = fixture.createWorkosIdentityWithRole("admin");
    const second = fixture.createWorkosIdentityWithRole("admin");
    const firstHeaders = await fixture.authHeadersFor(first);
    const secondHeaders = await fixture.authHeadersFor(second);
    const firstSlug = first.organization.slug ?? "missing-slug";
    const secondSlug = second.organization.slug ?? "missing-slug";
    const domainKey = `taken-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);

    mocks.verifyLinkedDomainChallengeMock.mockResolvedValue(ok({ method: "html_file" }));

    const createFirst = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug: firstSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers: firstHeaders },
    );
    expect(createFirst.status).toBe(201);
    const firstClaim = await createFirst.json();
    if (!("linkedDomain" in firstClaim)) {
      throw new Error("expected linkedDomain in create response");
    }

    const verifyFirst = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].verify.$post(
      {
        param: { organizationSlug: firstSlug, linkedDomainId: firstClaim.linkedDomain.id },
        json: { method: "html_file", createProject: true },
      },
      { headers: firstHeaders },
    );
    expect(verifyFirst.status).toBe(200);

    const createSecond = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug: secondSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers: secondHeaders },
    );
    expect(createSecond.status).toBe(409);
    const body = await createSecond.json();
    if (!("error" in body)) {
      throw new Error("expected error in conflict response");
    }
    expect(body.error).toBe("domain_already_claimed");

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("attaches a verified domain to an existing project", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    expect(organizationId).toBeTruthy();
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    expect(userId).toBeTruthy();

    const { ensureDefaultWorkspaceTeam } = await import("@/lib/teams/default-workspace-team");
    const team = await ensureDefaultWorkspaceTeam(organizationId!);
    const existingProjectId = `project_${crypto.randomUUID()}`;
    await db.insert(schema.projects).values({
      id: existingProjectId,
      organizationId: organizationId!,
      teamId: team.id,
      createdByUserId: userId!,
      name: "Existing project",
      source: "native",
      sourceLocale: "en",
      targetLocales: [],
    });

    const domainKey = `existing-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);
    mocks.verifyLinkedDomainChallengeMock.mockResolvedValue(ok({ method: "meta_tag" }));

    const createResponse = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    if (!("linkedDomain" in created)) {
      throw new Error("expected linkedDomain in create response");
    }

    const verifyResponse = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].verify.$post(
      {
        param: { organizationSlug, linkedDomainId: created.linkedDomain.id },
        json: { method: "meta_tag", projectId: existingProjectId },
      },
      { headers },
    );
    expect(verifyResponse.status).toBe(200);
    const verified = await verifyResponse.json();
    if (!("linkedDomain" in verified)) {
      throw new Error("expected linkedDomain in verify response");
    }
    expect(verified.linkedDomain.projectId).toBe(existingProjectId);

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("cancels a pending claim", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const domainKey = `cancel-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);

    const createResponse = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers },
    );
    const created = await createResponse.json();
    if (!("linkedDomain" in created)) {
      throw new Error("expected linkedDomain in create response");
    }

    const deleteResponse = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].$delete(
      {
        param: { organizationSlug, linkedDomainId: created.linkedDomain.id },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(204);

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("rejects canceling a verified claim and unknown linked domain ids", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    expect(organizationId).toBeTruthy();
    expect(userId).toBeTruthy();

    const domainKey = `cancel-verified-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);
    const [verifiedClaim] = await db
      .insert(schema.linkedDomains)
      .values({
        organizationId: organizationId!,
        createdByUserId: userId!,
        domainKey: audit.domainKey,
        domainSlug: audit.domainSlug,
        sourceUrl: audit.sourceUrl,
        status: "verified",
        verificationToken: "verified-token",
        localisationAuditId: audit.id,
        verifiedAt: new Date(),
        verifiedMethod: "dns_txt",
      })
      .returning();

    const verifiedDelete = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].$delete(
      {
        param: { organizationSlug, linkedDomainId: verifiedClaim.id },
      },
      { headers },
    );
    expect(verifiedDelete.status).toBe(400);
    await expect(verifiedDelete.json()).resolves.toMatchObject({
      error: "linked_domain_not_pending",
    });

    const missingDelete = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].$delete(
      {
        param: {
          organizationSlug,
          linkedDomainId: "00000000-0000-4000-8000-000000000099",
        },
      },
      { headers },
    );
    expect(missingDelete.status).toBe(404);
    await expect(missingDelete.json()).resolves.toMatchObject({
      error: "linked_domain_not_found",
    });

    const [stillPresent] = await db
      .select({ id: schema.linkedDomains.id, status: schema.linkedDomains.status })
      .from(schema.linkedDomains)
      .where(eq(schema.linkedDomains.id, verifiedClaim.id))
      .limit(1);
    expect(stillPresent).toEqual({ id: verifiedClaim.id, status: "verified" });

    await db.delete(schema.linkedDomains).where(eq(schema.linkedDomains.id, verifiedClaim.id));
    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("rejects claiming a domain slug that is not a valid audit slug", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: "Example.COM" },
      },
      { headers },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    if (!("error" in body)) {
      throw new Error("expected error in invalid slug response");
    }
    expect(body.error).toBe("invalid_domain_slug");
  });

  it("rejects claiming an audit that has not succeeded yet", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const domainKey = `pending-audit-${crypto.randomUUID().slice(0, 8)}.example`;
    const domainSlug = hostnameToDomainSlug(domainKey);
    const [audit] = await db
      .insert(schema.localisationAudits)
      .values({
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        status: "running",
        score: null,
        teaser: null,
        report: null,
      })
      .returning();

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug },
      },
      { headers },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    if (!("error" in body)) {
      throw new Error("expected error in audit_not_ready response");
    }
    expect(body.error).toBe("audit_not_ready");

    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });

  it("revives a failed claim with a fresh verification token", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    expect(organizationId).toBeTruthy();
    expect(userId).toBeTruthy();

    const domainKey = `revive-${crypto.randomUUID().slice(0, 8)}.example`;
    const audit = await insertSucceededAudit(domainKey);
    const staleToken = "stale-verification-token";
    const [failedClaim] = await db
      .insert(schema.linkedDomains)
      .values({
        organizationId: organizationId!,
        createdByUserId: userId!,
        domainKey: audit.domainKey,
        domainSlug: audit.domainSlug,
        sourceUrl: audit.sourceUrl,
        status: "failed",
        verificationToken: staleToken,
        localisationAuditId: audit.id,
      })
      .returning();

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"].$post(
      {
        param: { organizationSlug },
        json: { domainSlug: audit.domainSlug },
      },
      { headers },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    if (!("linkedDomain" in body)) {
      throw new Error("expected linkedDomain in revive response");
    }
    expect(body.linkedDomain.id).toBe(failedClaim.id);
    expect(body.linkedDomain.status).toBe("pending_verification");
    expect(body.linkedDomain.challenges.token).not.toBe(staleToken);
    expect(body.linkedDomain.challenges.htmlFile.body).toBe(body.linkedDomain.challenges.token);
    expect(body.linkedDomain.challenges.dnsTxt.value).toContain(body.linkedDomain.challenges.token);

    const [revived] = await db
      .select()
      .from(schema.linkedDomains)
      .where(eq(schema.linkedDomains.id, failedClaim.id))
      .limit(1);
    expect(revived?.status).toBe("pending_verification");
    expect(revived?.verificationToken).not.toBe(staleToken);
    expect(revived?.verificationToken.length).toBeGreaterThan(0);

    await db.delete(schema.linkedDomains).where(eq(schema.linkedDomains.id, failedClaim.id));
    await db.delete(schema.localisationAudits).where(eq(schema.localisationAudits.id, audit.id));
  });
});
