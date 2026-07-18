# Slack screenshot attachments

## Problem

Slack conversation turns can run `captureScreenshot` when the visual-mock skill is active, but the reply path only posts `result.text`. Screenshots stay in tool outputs and never reach the Slack thread.

## Decision

After `agent.generate()`, collect every successful `captureScreenshot` from `result.steps`, load stored bytes by `fileId`, and post one Slack message with markdown plus all screenshot files.

## Behavior

1. Scan `result.steps[].toolResults` for `toolName === "captureScreenshot"`.
2. Keep non-preliminary successes (`success: true` with `fileId`).
3. Load each file with `getStoredFileContent` (not the auth proxy URL).
4. Post once: `{ markdown?, files? }` with all uploads in step order.
5. Skip files that fail to load; still post text and remaining images.
6. Post files even when reply text is empty.

## Out of scope

- Streaming Slack replies
- Attaching non-screenshot tool artifacts
- Changing visual-mock flags, skills, or write gates

## Files

- `lib/agents/slack/screenshot-attachments.ts` — extract + load helpers
- `agents/hyperlocalise/agent/channels/slack.ts` — wire into reply post
- `lib/agent-runtime/tools/workspace/capture-screenshot.ts` — export success guard
- Tests for extractor and Slack reply attach
