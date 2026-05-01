# Inbox Page Design

## Date

2026-05-01

## Context

Hyperlocalise has three chat channels that produce translation work:

1. **Chat UI** — a web form where users paste text or ask the agent to translate files/strings.
2. **Email agent** — inbound emails to an organization-specific alias processed by a Resend-backed bot.
3. **GitHub agent** — PR comments mentioning `@hyperlocalise fix` processed by a GitHub App bot.

All three agents use the `chat` package (Chat SDK) with a Postgres state adapter for thread/message persistence. However, the SDK stores data in generic key-value tables (`chat_state_cache`, `chat_state_lists`) that are optimized for bot state machines, not for UI queries. There is no unified way to list conversations, view message history, or link them to translation jobs.

The Inbox page must:

- Show a unified list of conversations from all three sources.
- Display a chat interface when a conversation is selected.
- Show conversation metadata and linked translation jobs in a right panel.

## Decision

Build a **native conversation schema** in our application database. Agents continue to use the `chat` package for protocol adapters, but they also persist conversation metadata and messages to our own relational tables. Translation jobs gain a `conversationId` foreign key so the Inbox can display linked jobs.

This was chosen over reading the Chat SDK's key-value tables directly (unqueryable for lists) or maintaining only a lightweight mapping table (still forces us to read serialized message blobs).

## Database Schema

### conversations

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `organizationId` | `uuid` | FK → `organizations.id`, not null, cascade delete |
| `projectId` | `text` | Nullable FK → `translationProjects.id` |
| `source` | `pgEnum("conversation_source")` | `chat_ui`, `email_agent`, `github_agent` |
| `status` | `pgEnum("conversation_status")` | `active`, `archived`, `resolved` |
| `title` | `text` | Not null |
| `sourceThreadId` | `text` | Nullable, unique. The `chat` package thread ID for email/GitHub agents |
| `lastMessageAt` | `timestamp` | Not null, default now |
| `createdAt` | `timestamp` | Not null, default now |
| `updatedAt` | `timestamp` | Not null, default now, `$onUpdateFn` |

**Indexes**
- `idx_conversations_org_last_message` on (`organizationId`, `lastMessageAt`) — inbox list sorting
- `idx_conversations_source_thread` on (`sourceThreadId`) — agent lookups

### conversationMessages

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `conversationId` | `uuid` | FK → `conversations.id`, cascade delete |
| `senderType` | `pgEnum("message_sender_type")` | `user`, `agent` |
| `senderEmail` | `text` | Nullable — for email agent context |
| `text` | `text` | Not null |
| `attachments` | `jsonb` | Nullable. Array of `{id, filename, contentType, url}` |
| `createdAt` | `timestamp` | Not null, default now |

**Indexes**
- `idx_conversation_messages_conversation_created` on (`conversationId`, `createdAt`) — message history

### translationJobs (modified)

Add column:

| Column | Type | Constraints |
|--------|------|-------------|
| `conversationId` | `uuid` | Nullable FK → `conversations.id`, set null on delete |

**Indexes**
- `idx_translation_jobs_conversation` on (`conversationId`)

## UI Architecture

### Routes

| Route | Purpose |
|-------|---------|
| `/org/:organizationSlug/inbox` | Inbox list (left) + first/empty detail (right) |
| `/org/:organizationSlug/inbox/:conversationId` | Deep-link to a specific conversation |

### Layout

Three-pane layout on large screens, stacked on mobile:

1. **Left panel — Inbox list**
   - Query `conversations` filtered by `organizationId`, sorted by `lastMessageAt` desc.
   - Show title, source badge (Chat / Email / GitHub), last message preview, unread indicator.
   - Filter tabs: All, Mentioned, Blocked.

2. **Center panel — Chat detail**
   - Display `conversationMessages` in chronological order (oldest first).
   - For `chat_ui` sources: allow the user to type and send follow-up messages.
   - For `email_agent` and `github_agent` sources: read-only message history.
   - Bottom input area (enabled only for `chat_ui`).

3. **Right panel — Details & linked jobs**
   - **Details section**: source, status, created date, participants.
   - **Linked Jobs section**: query `translationJobs` where `conversationId` matches. Display as a scrollable list of job cards (ID, project, type, status badge, locale). Clicking a job navigates to the Jobs page.

## API Routes

All routes require organization membership (handled by existing auth middleware).

### `GET /api/orgs/:organizationSlug/conversations`
- Query params: `?status=active&limit=50&cursor=...`
- Returns paginated conversations for the org.

### `GET /api/orgs/:organizationSlug/conversations/:conversationId`
- Returns conversation metadata + last N messages.

### `GET /api/orgs/:organizationSlug/conversations/:conversationId/messages`
- Returns full message history.
- Query params: `?limit=50&before=messageId`

### `POST /api/orgs/:organizationSlug/conversations/:conversationId/messages`
- Body: `{ text: string }`
- Creates a new message in a `chat_ui` conversation.
- Triggers the agent to respond (translation jobs created as needed).

### `GET /api/orgs/:organizationSlug/conversations/:conversationId/jobs`
- Returns linked `translationJobs` for this conversation.

### `POST /api/orgs/:organizationSlug/chat-requests`
- Modify existing Chat UI submission endpoint.
- Create a `conversation` record (`source = 'chat_ui'`) and insert the user's request as the first `conversationMessage`.
- Agent processing creates `translationJob`(s) linked via `conversationId`.

## Data Flow

### Email Agent

1. Resend webhook receives email → `getEmailBot()` → `handleEmail()`.
2. **New thread**: after interpreting intent, create a `conversation` with `source = 'email_agent'`, `sourceThreadId = chatThreadId`, title from email subject.
3. **User message**: insert into `conversationMessages` (`senderType = 'user'`).
4. **Agent reply**: when the bot posts a reply, also insert into `conversationMessages` (`senderType = 'agent'`).
5. **Job created**: `enqueuePendingTranslation()` creates `EmailAgentTask` → also create `translationJob` with `conversationId`.

### GitHub Agent

1. GitHub webhook receives mention → `getGitHubBot()` → `handleMention()`.
2. **New thread**: create `conversation` with `source = 'github_agent'`, title from PR/issue context.
3. **Messages**: insert user mention and agent responses into `conversationMessages`.
4. **Fix workflow**: `githubFixWorkflow` runs. If a translation job is created, set `conversationId` on the job. If the fix is a direct commit with no job, no job link is created.

### Chat UI

1. User submits request on `/chat` → `POST /api/orgs/:orgSlug/chat-requests`.
2. Create `conversation` (`source = 'chat_ui'`), title from request text (truncated).
3. Insert user's message into `conversationMessages`.
4. Agent processes request, creates `translationJob`(s) with `conversationId`.
5. Agent response inserted into `conversationMessages`.

## Migration Strategy

- The Chat SDK's Postgres state adapter uses its own prefixed tables (`chat_state_*`) and remains untouched.
- Our new tables are additive. Agents write to both the Chat SDK state (for their internal logic) and our schema (for the UI).
- Existing email/GitHub threads created before deployment will not have `conversation` records. They are historical and will not appear in the Inbox unless backfilled.

## Trade-offs Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Native schema** (chosen) | Full control; queryable; easy joins with jobs | Minor duplication with Chat SDK state | ✅ Best fit |
| Lightweight mapping + Chat SDK state | No message duplication | Chat SDK stores serialized blobs; slow/awkward for UI; dual DB possible | ❌ Rejected |
| Read Chat SDK tables directly | Single source of truth | Generic key-value schema; unqueryable; fragile to package updates | ❌ Rejected |
