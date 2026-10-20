import {isRecord, readResponseJson, readString} from './json'
import type {SanityDocumentJob, SanitySegment} from './plugin-messages'
import {normalizeAppUrl} from './settings'

const ACCESS_TOKEN_HEADER = 'X-Hyperlocalise-Access-Token'
export const SANITY_JOB_POLL_INTERVAL_MS = 1_500

export type SanityResourceAuth = {
  accessToken: string
}

export type SanitySessionProject = {
  id: string
  name: string
  sourceLocale: string
  targetLocales: string[]
}

export type SanitySession = {
  organization: {id: string; name: string; slug: string | null}
  projects: SanitySessionProject[]
  connection: {
    id: string
    displayName: string
  }
}

export type SanityJobStatus = SanityDocumentJob

export class HyperlocaliseClientError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'HyperlocaliseClientError'
  }
}

type ErrorPayload = {error?: string; message?: string}

function apiUrl(appUrl: string, path: string) {
  return `${normalizeAppUrl(appUrl)}${path}`
}

function buildRequestHeaders(_appUrl: string, auth: SanityResourceAuth) {
  return {
    'Content-Type': 'application/json',
    [ACCESS_TOKEN_HEADER]: auth.accessToken,
  }
}

function parseErrorPayload(value: unknown): ErrorPayload {
  if (!isRecord(value)) {
    return {}
  }
  return {
    error: readString(value.error),
    message: readString(value.message),
  }
}

async function readError(response: Response): Promise<ErrorPayload> {
  return parseErrorPayload(await readResponseJson(response))
}

function throwIfFailed(
  response: Response,
  payload: ErrorPayload | null,
  fallbackCode: string,
  fallbackMessage: string,
) {
  if (response.ok) {
    return
  }
  throw new HyperlocaliseClientError(
    payload?.error ?? fallbackCode,
    payload?.message ?? fallbackMessage,
  )
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function parseSessionProject(value: unknown): SanitySessionProject | null {
  if (!isRecord(value)) {
    return null
  }
  const id = readString(value.id)
  const name = readString(value.name)
  if (!id || !name) {
    return null
  }
  return {
    id,
    name,
    sourceLocale: readString(value.sourceLocale) ?? '',
    targetLocales: parseStringArray(value.targetLocales),
  }
}

function parseSession(value: unknown): SanitySession | null {
  if (!isRecord(value) || !isRecord(value.session)) {
    return null
  }
  const session = value.session
  if (
    !isRecord(session.organization) ||
    !isRecord(session.connection) ||
    !Array.isArray(session.projects)
  ) {
    return null
  }
  const organizationId = readString(session.organization.id)
  const organizationName = readString(session.organization.name)
  const connectionId = readString(session.connection.id)
  const connectionName = readString(session.connection.displayName)
  if (!organizationId || !organizationName || !connectionId || !connectionName) {
    return null
  }
  return {
    organization: {
      id: organizationId,
      name: organizationName,
      slug: readString(session.organization.slug) ?? null,
    },
    projects: session.projects.flatMap((project) => {
      const parsed = parseSessionProject(project)
      return parsed ? [parsed] : []
    }),
    connection: {
      id: connectionId,
      displayName: connectionName,
    },
  }
}

function parseCollectResult(value: unknown): {
  projectId: string
  sourceFileId: string
  sourcePath: string
  segmentCount: number
} | null {
  if (!isRecord(value)) {
    return null
  }
  const projectId = readString(value.projectId)
  const sourceFileId = readString(value.sourceFileId)
  const sourcePath = readString(value.sourcePath)
  if (!projectId || !sourceFileId || !sourcePath) {
    return null
  }
  return {
    projectId,
    sourceFileId,
    sourcePath,
    segmentCount: typeof value.segmentCount === 'number' ? value.segmentCount : 0,
  }
}

function parseCreatedJob(value: unknown): {
  jobId: string
  generated: boolean
  projectId: string
  sourcePath: string
} | null {
  if (!isRecord(value) || !isRecord(value.job)) {
    return null
  }
  const jobId = readString(value.job.jobId)
  const projectId = readString(value.job.projectId)
  const sourcePath = readString(value.job.sourcePath)
  if (!jobId || !projectId || !sourcePath) {
    return null
  }
  return {
    jobId,
    generated: value.job.generated === true,
    projectId,
    sourcePath,
  }
}

function parseLocaleMap(value: unknown): Record<string, Record<string, string>> | null {
  if (!isRecord(value)) {
    return null
  }
  const locales: Record<string, Record<string, string>> = {}
  for (const [locale, translations] of Object.entries(value)) {
    if (!isRecord(translations)) {
      return null
    }
    const localeMap: Record<string, string> = {}
    for (const [key, text] of Object.entries(translations)) {
      if (typeof text !== 'string') {
        return null
      }
      localeMap[key] = text
    }
    locales[locale] = localeMap
  }
  return locales
}

export function isSanityDocumentJobPayload(value: unknown): value is SanityDocumentJob {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.jobId === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.status === 'string' &&
    typeof value.sourcePath === 'string' &&
    isRecord(value.translationsByLocale)
  )
}

function parseSanityDocumentJob(value: unknown): SanityDocumentJob | null {
  if (!isSanityDocumentJobPayload(value)) {
    return null
  }
  return {
    jobId: value.jobId,
    status: value.status,
    projectId: value.projectId,
    sourcePath: value.sourcePath,
    targetLocales: parseStringArray(value.targetLocales),
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    translationsByLocale: parseLocaleMap(value.translationsByLocale) ?? {},
  }
}

export function resourceAuthFromSettings(input: {
  accessToken?: string | null
}): SanityResourceAuth | null {
  const accessToken = input.accessToken?.trim()
  if (!accessToken) {
    return null
  }
  return {accessToken}
}

export async function fetchSanitySession(input: {
  appUrl: string
  auth: SanityResourceAuth
}): Promise<SanitySession> {
  const response = await fetch(apiUrl(input.appUrl, '/api/integrations/sanity/session'), {
    headers: buildRequestHeaders(input.appUrl, input.auth),
  })
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_session_failed',
    'Unable to load your Hyperlocalise session.',
  )
  const session = parseSession(payload)
  if (!session) {
    throw new HyperlocaliseClientError(
      'sanity_session_failed',
      'Unable to load your Hyperlocalise session.',
    )
  }
  return session
}

export async function collectSanityDocument(input: {
  appUrl: string
  auth: SanityResourceAuth
  projectId: string
  sanityProjectId: string
  dataset: string
  documentId: string
  documentType: string
  documentTitle?: string
  segments: SanitySegment[]
}): Promise<{
  projectId: string
  sourceFileId: string
  sourcePath: string
  segmentCount: number
}> {
  const response = await fetch(apiUrl(input.appUrl, '/api/integrations/sanity/collect'), {
    method: 'POST',
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      sanityProjectId: input.sanityProjectId,
      dataset: input.dataset,
      documentId: input.documentId,
      documentType: input.documentType,
      documentTitle: input.documentTitle,
      segments: input.segments,
    }),
  })
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_collect_failed',
    'Unable to upload page text.',
  )
  const result = parseCollectResult(payload)
  if (!result) {
    throw new HyperlocaliseClientError('sanity_collect_failed', 'Unable to upload page text.')
  }
  return result
}

export async function createSanityJob(input: {
  appUrl: string
  auth: SanityResourceAuth
  projectId: string
  sanityProjectId: string
  dataset: string
  documentId: string
  documentType: string
  documentTitle?: string
  sourceLocale: string
  targetLocales: string[]
  segments?: SanitySegment[]
  generate: boolean
}): Promise<{jobId: string; generated: boolean; projectId: string; sourcePath: string}> {
  const response = await fetch(apiUrl(input.appUrl, '/api/integrations/sanity/jobs'), {
    method: 'POST',
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      documents: [
        {
          sanityProjectId: input.sanityProjectId,
          dataset: input.dataset,
          documentId: input.documentId,
          documentType: input.documentType,
          documentTitle: input.documentTitle,
          segments: input.segments,
        },
      ],
      sourceLocale: input.sourceLocale,
      targetLocales: input.targetLocales,
      generate: input.generate,
    }),
  })
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_job_create_failed',
    'Unable to start translation.',
  )
  const job = parseCreatedJob(payload)
  if (!job) {
    throw new HyperlocaliseClientError('sanity_job_create_failed', 'Unable to start translation.')
  }
  return job
}

export type SanityLocaleDocumentStatusResponse = {
  documentId: string
  status: string
}

export type SanityLocaleStatusResponse = {
  locale: string
  isSource: boolean
  documents: SanityLocaleDocumentStatusResponse[]
}

function parseLocaleStatuses(value: unknown): {
  locales: SanityLocaleStatusResponse[]
  documents: unknown[]
} | null {
  if (!isRecord(value) || !Array.isArray(value.locales)) {
    return null
  }
  const locales: SanityLocaleStatusResponse[] = []
  for (const locale of value.locales) {
    if (!isRecord(locale)) {
      continue
    }
    const code = readString(locale.locale)
    if (!code) {
      continue
    }
    const documents = Array.isArray(locale.documents)
      ? locale.documents.flatMap((document): SanityLocaleDocumentStatusResponse[] => {
          if (!isRecord(document)) {
            return []
          }
          const documentId = readString(document.documentId)
          const status = readString(document.status)
          if (!documentId || !status) {
            return []
          }
          return [{documentId, status}]
        })
      : []
    locales.push({
      locale: code,
      isSource: locale.isSource === true,
      documents,
    })
  }
  return {
    locales,
    documents: Array.isArray(value.documents) ? value.documents : [],
  }
}

export async function fetchSanityLocaleStatusesFromApi(input: {
  appUrl: string
  auth: SanityResourceAuth
  projectId: string
  sanityProjectId: string
  dataset: string
  documentIds: string[]
}): Promise<{locales: SanityLocaleStatusResponse[]; documents: unknown[]}> {
  const params = new URLSearchParams({
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentIds: input.documentIds.join(','),
    projectId: input.projectId,
  })
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/locales?${params.toString()}`),
    {headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_locales_failed',
    'Unable to load locale status.',
  )
  const result = parseLocaleStatuses(payload)
  if (!result) {
    throw new HyperlocaliseClientError('sanity_locales_failed', 'Unable to load locale status.')
  }
  return result
}

type SanityDocumentQuery = {
  appUrl: string
  auth: SanityResourceAuth
  projectId: string
  sanityProjectId: string
  dataset: string
  documentId: string
  documentType: string
}

function documentQueryParams(input: SanityDocumentQuery, extra?: Record<string, string>) {
  const params = new URLSearchParams({
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    documentType: input.documentType,
    ...extra,
  })
  return params
}

export async function fetchCurrentSanityJob(
  input: SanityDocumentQuery,
): Promise<{job: SanityDocumentJob | null}> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/sanity/jobs/current?${documentQueryParams(input).toString()}`,
    ),
    {headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_job_fetch_failed',
    'Unable to load the current job.',
  )
  if (!isRecord(payload) || payload.job == null) {
    return {job: null}
  }
  return {job: parseSanityDocumentJob(payload.job)}
}

export async function getSanityJob(input: {
  appUrl: string
  auth: SanityResourceAuth
  jobId: string
}): Promise<SanityDocumentJob> {
  const response = await fetch(
    apiUrl(input.appUrl, `/api/integrations/sanity/jobs/${encodeURIComponent(input.jobId)}`),
    {headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_job_fetch_failed',
    'Unable to load the job.',
  )
  const job = isRecord(payload) ? parseSanityDocumentJob(payload.job) : null
  if (!job) {
    throw new HyperlocaliseClientError('sanity_job_fetch_failed', 'Unable to load the job.')
  }
  return job
}

export async function generateSanityLocaleJob(
  input: Omit<Parameters<typeof createSanityJob>[0], 'generate' | 'segments'>,
): Promise<{jobId: string; generated: boolean; projectId: string; sourcePath: string}> {
  return createSanityJob({
    ...input,
    generate: true,
  })
}

export async function generateSanityJob(input: {
  appUrl: string
  auth: SanityResourceAuth
  jobId: string
}): Promise<void> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/sanity/jobs/${encodeURIComponent(input.jobId)}/generate`,
    ),
    {method: 'POST', headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readError(response)
  throwIfFailed(response, payload, 'sanity_job_generate_failed', 'Unable to generate translations.')
}

export type SanityPullTranslationsPayload =
  | SanityDocumentJob
  | Record<string, Record<string, string>>

function isLocaleTranslationMap(value: unknown): value is Record<string, Record<string, string>> {
  if (!isRecord(value) || isSanityDocumentJobPayload(value)) {
    return false
  }
  if ('jobId' in value && value.jobId === null) {
    return false
  }
  return Object.values(value).every((entry) => isRecord(entry))
}

export type SanitySourcePullPagePayload = {
  locale: string
  sourcePath: string
  needsReupload: boolean
  entries: Array<{key: string; source: string; knownTexts: string[]}>
}

function parseSourcePage(value: unknown): SanitySourcePullPagePayload | null {
  if (!isRecord(value) || !isRecord(value.sourcePage)) {
    return null
  }
  const page = value.sourcePage
  const locale = readString(page.locale)
  const sourcePath = readString(page.sourcePath)
  if (!locale || !sourcePath || !Array.isArray(page.entries)) {
    return null
  }
  return {
    locale,
    sourcePath,
    needsReupload: page.needsReupload === true,
    entries: page.entries.flatMap((entry) => {
      if (!isRecord(entry)) {
        return []
      }
      const key = readString(entry.key)
      const source = readString(entry.source)
      if (!key || source === undefined) {
        return []
      }
      return [{key, source, knownTexts: parseStringArray(entry.knownTexts)}]
    }),
  }
}

export async function pullSanitySourcePage(
  input: SanityDocumentQuery & {locale: string},
): Promise<SanitySourcePullPagePayload> {
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/sanity/translations?${documentQueryParams(input, {locale: input.locale}).toString()}`,
    ),
    {headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_source_pull_failed',
    'Unable to load source text.',
  )
  const sourcePage = parseSourcePage(payload)
  if (!sourcePage) {
    throw new Error('Unable to load source text.')
  }
  return sourcePage
}

export type SanityApplyPlan = {
  i18nMode: 'document' | 'field'
  targetSanityLocale: string
  document: Record<string, unknown>
  missingKeys: string[]
}

function parseApplyPlan(value: unknown): SanityApplyPlan | null {
  if (!isRecord(value) || !isRecord(value.plan)) {
    return null
  }
  const plan = value.plan
  const i18nMode = plan.i18nMode === 'document' || plan.i18nMode === 'field' ? plan.i18nMode : null
  const targetSanityLocale = readString(plan.targetSanityLocale)
  if (!i18nMode || !targetSanityLocale || !isRecord(plan.document)) {
    return null
  }
  const missingKeys = Array.isArray(plan.missingKeys)
    ? plan.missingKeys.filter((key): key is string => typeof key === 'string')
    : []
  return {
    i18nMode,
    targetSanityLocale,
    document: plan.document,
    missingKeys,
  }
}

export async function fetchSanityApplyPlan(input: {
  appUrl: string
  auth: SanityResourceAuth
  projectId: string
  sourcePath: string
  document: Record<string, unknown>
  i18nMode: 'document' | 'field'
  sourceSanityLocale: string
  targetSanityLocale: string
}): Promise<SanityApplyPlan> {
  const response = await fetch(apiUrl(input.appUrl, '/api/integrations/sanity/apply-plan'), {
    method: 'POST',
    headers: buildRequestHeaders(input.appUrl, input.auth),
    body: JSON.stringify({
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      document: input.document,
      i18nMode: input.i18nMode,
      sourceSanityLocale: input.sourceSanityLocale,
      targetSanityLocale: input.targetSanityLocale,
    }),
  })
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_apply_plan_failed',
    'Unable to build an apply plan.',
  )
  const plan = parseApplyPlan(payload)
  if (!plan) {
    throw new HyperlocaliseClientError('sanity_apply_plan_failed', 'Unable to build an apply plan.')
  }
  return plan
}

export async function pullSanityTranslations(
  input: SanityDocumentQuery & {locale?: string},
): Promise<SanityPullTranslationsPayload> {
  const locale = input.locale?.trim()
  const response = await fetch(
    apiUrl(
      input.appUrl,
      `/api/integrations/sanity/translations?${documentQueryParams(
        input,
        locale ? {locale} : undefined,
      ).toString()}`,
    ),
    {headers: buildRequestHeaders(input.appUrl, input.auth)},
  )
  const payload = await readResponseJson(response)
  throwIfFailed(
    response,
    parseErrorPayload(payload),
    'sanity_translations_failed',
    'Unable to load translations.',
  )
  const translations = isRecord(payload) ? payload.translations : undefined
  if (isRecord(translations) && translations.jobId === null) {
    throw new Error('No translations found for this page.')
  }
  if (isSanityDocumentJobPayload(translations)) {
    const job = parseSanityDocumentJob(translations)
    if (job) {
      return job
    }
  }
  if (isLocaleTranslationMap(translations)) {
    return translations
  }
  throw new Error('Unable to load translations.')
}
