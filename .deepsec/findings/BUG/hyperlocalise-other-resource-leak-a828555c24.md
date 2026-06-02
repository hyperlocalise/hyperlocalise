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

## Revalidation

**Verdict:** true-positive

The duplicate-click part of the original report has been addressed: the current code has isStartingMediaRecorderRef, sets it before awaiting getUserMedia, checks it in startMediaRecorder, and ignores additional toggle attempts while a start is pending. However, the broader start-race resource leak remains through component unmount while getUserMedia is pending. The unmount cleanup only stops mediaRecorderRef.current and streamRef.current, but those refs are not assigned until after getUserMedia resolves. If a user clicks the microphone fallback, navigates away or otherwise unmounts the component while the browser permission or device acquisition promise is pending, the cleanup runs with null refs. When getUserMedia later resolves, startMediaRecorder continues, assigns streamRef, creates a MediaRecorder, calls mediaRecorder.start(), and sets state even though there is no mounted component or reachable stop button. There is no mounted/cancelled ref checked after the await and no finally cleanup for a stream acquired after the component became stale. This can orphan a microphone stream in the same code path and with the same missing stale-start handling described by the finding, even though the repeated-click multi-stream variant is fixed.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-10)
