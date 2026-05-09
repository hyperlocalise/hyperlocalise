# [BUG] MediaRecorder start race can orphan microphone streams

**File:** [`apps/hyperlocalise-web/src/components/ai-elements/speech-input.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/components/ai-elements/speech-input.tsx#L185-L266) (lines 185, 191, 239, 241, 255, 266)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-resource-leak`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

In the MediaRecorder fallback path, toggleListening calls startMediaRecorder whenever isListening is false. startMediaRecorder awaits navigator.mediaDevices.getUserMedia before setting isListening to true, and there is no pending-start guard. Repeated clicks while permission or device acquisition is pending can create multiple MediaStream and MediaRecorder instances. mediaRecorderRef and streamRef are overwritten with the latest instance only, so earlier streams can continue recording and cannot be stopped by the stop button or normal unmount cleanup.

## Recommendation

Add an isStarting state or ref that is set before awaiting getUserMedia, disable or ignore duplicate starts while it is true, and clear it in a finally block. If a start becomes stale, immediately stop every track from the acquired stream. Consider tracking all active streams/recorders so cleanup can stop them reliably.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-06)
