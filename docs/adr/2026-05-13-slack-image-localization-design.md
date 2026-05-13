# Slack Image Localization Design

## Date

2026-05-13

## Context

The Slack agent can answer localization questions and create text or file
translation jobs, but it currently passes only `message.text` into the agent
loop. Chat SDK exposes incoming Slack files as normalized message attachments,
including image attachments with `fetchData()`. The email agent already has an
image localization path that sends the source image and interpreted user intent
to the image model, then replies with a generated localized image file.

Users expect the Slack agent to support the same basic image localization flow:
send a campaign image, mention the target language, and receive a localized
image back in the thread.

## Decision

Add shared image localization helpers plus a Slack-specific intake handler that
reuses the existing image generation service rather than creating a durable
visual-asset job. This keeps the feature small, immediate, and aligned with the
email image behavior without duplicating the attachment pipeline.

The shared helper will:

- Detect image attachments from Chat SDK messages.
- Fetch image bytes from `data`, `Blob`, or authenticated `fetchData()`.
- Build the image localization prompt from common instructions plus
  channel-provided context.
- Call `regenerateImageFromAttachment`.
- Choose the output filename and MIME type.

The Slack handler will:

- Detect image attachments from `message.attachments`.
- Require a target locale in the Slack message text.
- Pass Slack request text and target locale into the shared helper.
- Reply to Slack with a generated image file using `thread.post({ raw, files })`.

## Data Flow

1. Slack webhook enters the existing Chat SDK bot.
2. `handleNewConversation` or `handleSubscribedMessage` persists the user
   message and verifies the workspace connector.
3. The Slack bot verifies the sender is a Hyperlocalise workspace member.
4. If the message contains image attachments, the bot handles those attachments
   before the normal text-agent response.
5. If no target language is present, the bot asks the user to resend the image
   with a target language.
6. If a target language is present, each image is passed through the shared image
   localization helper and posted back to the same Slack thread.
7. Non-image Slack messages continue through the existing text-agent flow.

## Error Handling

- Missing workspace membership: use the existing account verification response.
- Missing target locale: ask for a target language before localizing images.
- Missing image data or generation failure: reply with a concise retry message.
- Mixed image and text requests: image localization runs first, then the normal
  agent can still answer the text request when the message has meaningful text.

## OAuth Scopes

Slack installs need:

- `files:read` to fetch uploaded images.
- `files:write` to upload localized image replies.

Existing installations may need to reconnect Slack to grant these scopes.

## Testing

Add unit coverage for:

- Slack install URLs include the file scopes.
- Image messages call the Slack image handler and post a generated file.
- Image messages without a target locale ask for clarification.
- Non-image Slack messages still use the existing text-agent flow.
