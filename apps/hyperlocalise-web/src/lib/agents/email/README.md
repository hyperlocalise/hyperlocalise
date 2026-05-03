# Email Agent Architecture

The email agent turns inbound Resend messages into generic email-agent tasks. It
also manages the user-facing email conversation around each request: intake,
clarification, confirmation, progress, completion, and failure.

The code is split by integration boundary so the workflow stays testable.

## Request Flow

1. `bot.ts` receives subscribed chat messages from the Resend chat adapter.
2. `users.ts` verifies that the sender is a registered Hyperlocalise user.
3. `organizations.ts` resolves the addressed inbound alias to an enabled
   organization where the sender is a member.
4. `intent.ts` asks `gpt-5.4-mini` to classify the subject and body as a
   translation, check, keyword research, or unknown request.
5. `image-attachments.ts` sends image attachments and the interpreted request
   directly to the image model, then replies with the generated image.
6. `bot.ts` stores a pending request when the agent needs missing locales or
   confirmation.
7. `attachments.ts` resolves Resend attachment download URLs for accepted file
   attachments.
8. `bot.ts` sends an intake receipt with files, locales, request ID, and applied
   instructions.
9. `bot.ts` enqueues one `EmailAgentTask` for each non-image attachment.
10. `workflows/email-translation.ts` downloads the attachment in a sandbox, runs
    the translation command, and replies with the translated file.

## Conversation States

The email handler treats the thread as a small state machine:

- New request: parse the email, validate the sender and workspace, then inspect
  attachments and intent.
- Missing fields: store `pendingEmailAgentTask` and ask for the missing
  source or target locale. A later reply can provide only the missing values; the
  user does not need to reattach files.
- Low confidence: store `pendingEmailAgentTask` and ask the user to reply
  `yes` or send corrected locales.
- Accepted request: fetch attachment download URLs, send an intake receipt, and
  enqueue translation jobs.
- Duplicate request: use `processedEmailAgentTaskKeys` to avoid enqueueing the
  same email attachment for the same task, locale pair, and instruction set.
- Completed request: the workflow replies with the translated file, original
  filename, output filename, locale pair, and request ID.
- Failed request: the workflow sends a user-facing failure email, then rethrows
  the error so the run can still be retried or inspected.

## Intent Parsing

`intent.ts` replaces format-specific locale regex parsing with a structured
model call. The model extracts:

- `sourceLocale`: the source BCP 47 locale, or `null` when missing.
- `targetLocale`: the target BCP 47 locale, or `null` when missing.
- `kind`: the requested capability, currently `translate`, `check`,
  `keyword_research`, or `unknown`.
- `instructions`: optional translation preferences such as tone, terminology,
  audience, or style.
- `confidence`: the model's confidence in the extracted request.
- `missingFields`: required fields that need clarification.

The model call is not trusted blindly. The interpreter normalizes locale tags
with `Intl.Locale`, trims instructions, and recomputes missing locale fields.
The bot only starts work when required locales are present and confidence is high
enough, or when the user confirms a pending low-confidence request.

## Queue Contract

The email agent task carries:

- request metadata: `requestId`, sender email, original subject, and original
  message ID.
- organization metadata: the resolved organization inbound email address used
  as the reply sender.
- input metadata: Resend attachment ID, filename, content type, and download URL.
- task parameters: for `translate`, source locale, target locale, and
  interpreted instructions.
- reply policy: threaded email replies to the original sender.

Workflow replies use the organization inbound address as the sender instead of
the global Resend fallback address. Translation instructions are written into
the temporary Hyperlocalise config as prompt instructions before the sandbox run.

## Failure Modes

- Unknown sender: the bot explains that the inbox only accepts messages from
  workspace members.
- Inactive or unauthorized inbound address: the bot asks the sender to use the
  active workspace address or ask an admin to enable the email agent.
- No attachments: the bot explains the required request shape and gives examples.
- Image-only attachments: the bot uses the interpreted target locale and
  instructions to generate a localized image reply.
- Missing or low-confidence image intent: the bot asks the sender to resend the
  image with a clearer target language and instructions.
- Missing email metadata: the bot asks the sender to resend the request because
  it cannot fetch attachments or thread the reply reliably.
- Missing locale intent: the bot stores the pending request and asks only for the
  missing locale fields.
- Low-confidence locale intent: the bot stores the pending request and asks the
  user to confirm or correct the locale pair.
- Duplicate webhook delivery: the bot does not enqueue duplicate attachment
  translation jobs for the same email and locale pair.
- Attachment download or translation failure: the workflow replies with a
  user-facing failure message, then raises an error so the run can be retried or
  inspected.

## Test Coverage

`bot.test.ts` covers the main email UX paths:

- accepted file translations send an intake receipt and enqueue jobs.
- missing locales create a pending request.
- replies to pending requests continue without new attachments.
- low-confidence intent asks for confirmation before enqueueing.
- duplicate requests do not enqueue duplicate jobs.
- image-only emails generate a localized image when the target language is clear.
