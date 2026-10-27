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
import { and, eq } from "drizzle-orm";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import {
  loadPushLocaleTranslationProgress,
  pushLocaleHasApprovedTranslations,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import type { CustomerIoResourceKind } from "./constants";
import { loadCustomerIoAutomationClient } from "./credentials";
import {
  resolveCustomerIoImportResources,
  selectedCustomerIoActionIds,
  selectedCustomerIoResourceIds,
  type CustomerIoImportResource,
} from "./import-customer-io-campaigns";
import { mapProjectLocalesToCustomerIo } from "./locale";
import {
  buildCustomerIoResourceSourcePath,
  listCustomerIoResourceActions,
} from "./push-customer-io-campaigns";
import { isCustomerIoLocalizableActionType } from "./translation-map";

export type CustomerIoPushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: CustomerIoResourceKind;
  name: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type CustomerIoPushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: CustomerIoPushItem[];
};

const CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY = 3;

async function collectCustomerIoPushLocales(input: {
  includeLocaleProgress: boolean;
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  jobTargetLocales: readonly string[];
}) {
  const eligibleLocales: string[] = [];
  const locales: PushLocaleProgressRow[] = [];
  const loadPrefilled = (
    request: Parameters<ProjectTranslationService["loadAsPrefilledEntries"]>[0],
  ) => input.translationService.loadAsPrefilledEntries(request);
  for (const projectLocale of input.jobTargetLocales) {
    const localeInput = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: projectLocale,
    };
    if (input.includeLocaleProgress) {
      const localeProgress = await loadPushLocaleTranslationProgress(loadPrefilled, localeInput);
      locales.push(toPushLocaleProgressRow(projectLocale, localeProgress));
      if (localeProgress.approvedKeyCount > 0) {
        eligibleLocales.push(projectLocale);
      }
      continue;
    }
    if (await pushLocaleHasApprovedTranslations(loadPrefilled, localeInput)) {
      eligibleLocales.push(projectLocale);
    }
  }
  return { eligibleLocales, locales };
}

export async function getCustomerIoPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  includeLocaleProgress?: boolean;
}): Promise<CustomerIoPushEligibility | null> {
  const includeLocaleProgress = input.includeLocaleProgress ?? false;
  const customerIo = input.automation.toolConfig.customerIo;
  if (!customerIo?.enabled) {
    return null;
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return null;
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    return { eligibleLocaleCount: 0, mappedItemCount: 0, items: [] };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToCustomerIo({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
  });
  if (!localeMapping.sourceSuffix) {
    return { eligibleLocaleCount: 0, mappedItemCount: 0, items: [] };
  }

  const loaded = await loadCustomerIoAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: customerIo.workosUserId,
  });
  if (!loaded.ok) {
    return { eligibleLocaleCount: 0, mappedItemCount: 0, items: [] };
  }

  const actionSelections: Record<CustomerIoResourceKind, Record<string, string[]>> = {
    broadcast: customerIo.broadcastActions ?? {},
    campaign: customerIo.campaignActions ?? {},
    newsletter: customerIo.newsletterActions ?? {},
    transactional: customerIo.transactionalMessageActions ?? {},
  };
  const resources = await resolveCustomerIoImportResources(loaded.value, {
    broadcastIds: selectedCustomerIoResourceIds([
      ...customerIo.broadcastIds,
      ...Object.keys(actionSelections.broadcast),
    ]),
    campaignIds: selectedCustomerIoResourceIds([
      ...customerIo.campaignIds,
      ...Object.keys(actionSelections.campaign),
    ]),
    newsletterIds: selectedCustomerIoResourceIds([
      ...(customerIo.newsletterIds ?? []),
      ...Object.keys(actionSelections.newsletter),
    ]),
    transactionalMessageIds: selectedCustomerIoResourceIds([
      ...(customerIo.transactionalMessageIds ?? []),
      ...Object.keys(actionSelections.transactional),
    ]),
  });

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: CustomerIoPushItem[] = [];

  const collect = async (resource: CustomerIoImportResource) => {
    const selectedIds = selectedCustomerIoActionIds(actionSelections[resource.kind], resource.id);
    const actions = (await listCustomerIoResourceActions(loaded.value, resource)).filter(
      (action) =>
        isCustomerIoLocalizableActionType(action.type) &&
        action.language.trim() === "" &&
        (!selectedIds || selectedIds.includes(action.id)),
    );
    const rows: CustomerIoPushItem[] = [];
    for (const action of actions) {
      const sourcePath = buildCustomerIoResourceSourcePath(resource, action.id);
      const { eligibleLocales, locales } = await collectCustomerIoPushLocales({
        includeLocaleProgress,
        translationService,
        organizationId: input.organizationId,
        projectId,
        sourcePath,
        jobTargetLocales: localeMapping.jobTargetLocales,
      });
      eligibleLocaleCount += eligibleLocales.length;
      if (eligibleLocales.length > 0) {
        mappedItemCount += 1;
      }
      rows.push({
        sourceId: `${resource.id}/${action.id}`,
        sourcePath,
        resourceKind: resource.kind,
        name: `${resource.name} — ${action.name || action.id}`,
        status: "active",
        eligibleLocaleCount: eligibleLocales.length,
        targetLocaleCount: localeMapping.jobTargetLocales.length,
        eligibleLocales,
        locales,
        lastPushedAt: null,
        lastError: null,
      });
    }
    return rows;
  };

  const grouped = await mapWithConcurrency(resources, CUSTOMER_IO_PUSH_DETAIL_CONCURRENCY, collect);
  for (const rows of grouped) {
    items.push(...rows);
  }

  return { eligibleLocaleCount, mappedItemCount, items };
}

export function isCustomerIoPushRunActive(
  runs: ReadonlyArray<Pick<WorkspaceAutomationRunRecord, "status" | "inputSnapshot">>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    const operation = (run.inputSnapshot as { operation?: unknown } | null)?.operation;
    return operation === "push_approved";
  });
}
