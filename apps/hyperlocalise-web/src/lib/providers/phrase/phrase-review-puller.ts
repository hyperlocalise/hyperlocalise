import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import { buildProviderReviewReport } from "@/lib/providers/provider-job-review/normalize-provider-review";
import type { ProviderReviewReport } from "@/lib/providers/provider-job-review/types";

import { schema } from "@/lib/database";

import { PhraseApiClient, PhraseApiError } from "./phrase-api";
import {
  findPhraseTmsJobPart,
  parsePhraseExternalJobId,
  resolvePhraseBranch,
  resolvePhraseStringsProjectId,
  resolvePhraseTmsProjectUid,
} from "./phrase-job-context";
import {
  buildPhraseStringsKeyProviderUrl,
  buildPhraseTmsJobProviderUrl,
  normalizePhraseKeyCommentToThread,
  normalizePhraseLqaConversationToThread,
  normalizePhrasePlainConversationToThread,
} from "./phrase-review-normalize";
import { PhraseTmsApiClient, PhraseTmsApiError } from "./phrase-tms-api";

type ExternalTmsProject = typeof schema.projects.$inferSelect;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function resolvePhraseProjectSlugs(project: ExternalTmsProject) {
  const metadata = project.providerMetadata ?? {};
  const accountSlug = typeof metadata.accountSlug === "string" ? metadata.accountSlug.trim() : null;
  const projectSlug = typeof metadata.slug === "string" ? metadata.slug.trim() : null;

  return { accountSlug: accountSlug || null, projectSlug: projectSlug || null };
}

export type PhraseReviewPullInput = {
  credential: { baseUrl?: string | null; region?: string | null };
  secretMaterial: string;
  externalProjectId: string;
  externalJobId: string;
  project: ExternalTmsProject;
  content: ExternalTmsTaskContent;
  fetchFn?: typeof fetch;
};

export async function pullPhraseProviderReview(
  input: PhraseReviewPullInput,
): Promise<ProviderReviewReport> {
  if (!input.externalProjectId.trim() || !input.externalJobId.trim()) {
    throw new Error("invalid_phrase_project_or_job_id");
  }

  if (!parsePhraseExternalJobId(input.externalJobId)) {
    throw new Error("invalid_phrase_external_job_id");
  }

  const stringsProjectId = resolvePhraseStringsProjectId(input.project, input.externalProjectId);
  const tmsProjectUid = resolvePhraseTmsProjectUid(input.project, input.externalProjectId);
  const branch = resolvePhraseBranch(input.project);
  const { accountSlug, projectSlug } = resolvePhraseProjectSlugs(input.project);

  const stringsClient = new PhraseApiClient({
    token: input.secretMaterial,
    region: input.credential.region,
    baseUrl: input.credential.baseUrl,
    fetchFn: input.fetchFn,
  });

  const tmsClient = new PhraseTmsApiClient({
    token: input.secretMaterial,
    baseUrl: input.credential.baseUrl,
    fetchFn: input.fetchFn,
  });

  const stringKeyById = new Map(
    input.content.units.map((unit) => [unit.externalStringId, unit.key] as const),
  );

  const keyIds = new Set<string>();
  for (const unit of input.content.units) {
    const keyId = unit.externalStringId.trim();
    if (keyId) {
      keyIds.add(keyId);
    }
  }

  let jobProviderUrl: string | null = null;
  let targetLocale: string | null = input.content.targetLocales[0]?.trim() || null;

  const tmsThreads: ReturnType<typeof normalizePhraseLqaConversationToThread>[] = [];

  if (tmsProjectUid) {
    try {
      const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
      const jobPart = findPhraseTmsJobPart({
        externalJobId: input.externalJobId,
        jobParts,
      });

      if (jobPart) {
        targetLocale = jobPart.targetLang.trim() || targetLocale;
        jobProviderUrl = buildPhraseTmsJobProviderUrl({
          tmsBaseUrl: tmsClient.resolvedBaseUrl,
          projectUid: tmsProjectUid,
          jobUid: jobPart.uid,
        });

        const [lqaConversations, plainConversations] = await Promise.all([
          tmsClient.listLqaConversations(jobPart.uid),
          tmsClient.listPlainConversations(jobPart.uid),
        ]);

        for (const conversation of lqaConversations) {
          tmsThreads.push(
            normalizePhraseLqaConversationToThread({
              conversation,
              externalProjectId: input.externalProjectId,
              externalJobId: input.externalJobId,
              jobProviderUrl,
              targetLocale,
            }),
          );
        }

        for (const conversation of plainConversations) {
          tmsThreads.push(
            normalizePhrasePlainConversationToThread({
              conversation,
              externalProjectId: input.externalProjectId,
              externalJobId: input.externalJobId,
              jobProviderUrl,
            }),
          );
        }
      }
    } catch (error) {
      if (error instanceof PhraseTmsApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      throw error;
    }
  }

  const keyCommentThreads: ReturnType<typeof normalizePhraseKeyCommentToThread>[] = [];
  const keyIdList = [...keyIds];

  if (keyIdList.length > 0 && stringsProjectId) {
    try {
      const listOptions = { branch };

      for (const chunk of chunkArray(keyIdList, 10)) {
        const chunkResults = await Promise.all(
          chunk.map(async (keyId) => {
            const comments = await stringsClient.listKeyComments(
              stringsProjectId,
              keyId,
              listOptions,
            );
            const keyProviderUrl = buildPhraseStringsKeyProviderUrl({
              accountSlug,
              projectSlug,
              keyId,
            });

            const threadsForKey = await Promise.all(
              comments.map(async (comment) => {
                const replies =
                  comment.hasReplies && comment.id.trim()
                    ? await stringsClient.listCommentReplies(
                        stringsProjectId,
                        keyId,
                        comment.id,
                        listOptions,
                      )
                    : [];

                return normalizePhraseKeyCommentToThread({
                  comment,
                  replies,
                  keyId,
                  externalProjectId: input.externalProjectId,
                  externalJobId: input.externalJobId,
                  stringKeyById,
                  keyProviderUrl,
                });
              }),
            );

            return threadsForKey;
          }),
        );

        for (const threads of chunkResults) {
          keyCommentThreads.push(...threads);
        }
      }
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
      throw error;
    }
  }

  const threads = [...tmsThreads, ...keyCommentThreads].filter(
    (thread): thread is NonNullable<typeof thread> => thread != null,
  );

  const deduped = new Map(threads.map((thread) => [thread.threadId, thread] as const));

  return buildProviderReviewReport([...deduped.values()]);
}
