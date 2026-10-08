# Automation assistant as its own agent, sessions and panel

## Status

Proposed.

## Context

The automation setup assistant was built as a capability of the chat dock's localisation agent ([plan](../plans/2026-10-05-automation-assistant-design.md)). That agent is a worker: it translates files, finds context for source strings, reads git history, checks TMS progress, searches glossaries and keeps the organisation's Memory. It serves the dock, the Inbox, the Crowdin app and Slack from one loop, and its conversations are the team's threads, listed in the Inbox by design ([Inbox design](2026-05-01-inbox-design.md)).

Fitting setup into it needed an operator gate, a context only the web dock can send, a skip of the repository classifier, and a prompt that carries every other skill. A setup chat turns back into a localisation chat the moment its page closes. The gate is a requirement (automations are for admins and localisation managers); the rest is the cost of putting a configuration helper inside a content worker.

Two more things bear on the shape:

- Dock chats share the Inbox's visibility rule, so a setup session is visible to, and continuable by, other operators. A setup session is one person's working notes on one automation, not a team thread.
- The assistant will also build and edit visual workflows. The visual editor has no assistant hooks today, and under the current shape the canvas would be a third context kind inside the same prompt.

There is a precedent for a different-purpose chat: public web chat runs the workspace automation's own agent through its own route, stores messages in the conversation tables, and shows read-only in the Inbox.

## Decision

Give the assistant its own agent, its own sessions and its own panel inside the automation editors. Conversations, the dock and the Inbox stay as they are.

### Sessions

- `interactions` gains the source `automation_assistant` and two nullable columns, the creating user's id and the automation's id. These rows get no inbox item, so the Inbox list and the existing visibility helper never see them.
- Access is its own check: same organisation, operator role, author. No one else can read or continue a session.
- One session per saved automation, resumed when its page opens. A session for a new automation gets its automation id when Create succeeds; until then it is bound to nothing.
- An unbound session is thrown away with the page: it is never resumed, a new page always starts a fresh one, and the server deletes unbound sessions after a day through an `expires_at` column, as the repository sandbox sessions are. A turn still running when the page is left finishes into the abandoned session and is never shown; the unsaved setup it described is gone with the page anyway. No request is sent on unload, because none is reliable there.
- Message persistence and parts are reused as they are. The session's history comes from its own small loader: the session's messages within a budget, newest kept, text only. The shared loader, which reads the oldest fifty messages of a conversation, is not used.

### Agent

- A package `src/agents/automation-assistant/agent/` with today's setup skill text as its instructions, the setup tool, project lookup, and later a visual workflow tool. No repository classifier, no sandbox, no subagents, no translation or web tools, a small step limit.
- The same model resolver, so the gateway and customer keys apply. The same usage reservation, with its own operation key and a `surface` dimension, so assistant turns can be counted apart from dock turns.

### Routes

- Under the automations API: create a session (optional automation id, first message), stream a turn (message and page context), get the session for an automation, bind an automation id after Create.
- A session runs one turn at a time. The running turn is recorded on the row before any work starts; a second start answers 409 and the page shows the turn in progress.
- The web channel's streaming helper is factored so both agents call it.

### Panel

- Mounted by the form editor and the visual editor, built from the existing composer and message list. Its own small store: session id, messages, stream status. No tabs, no local-storage restore, no reply started by a page load. A turn begins only when someone sends from that page.
- A collapsible panel on the right of the editor, opened from a button in the editor's header, and a sheet from the right edge on narrow screens. Never floating and never bottom-right, so it cannot be taken for the dock.
- Titled "Automation assistant" with the automation's name, its own empty state ("Describe what this automation should do, or ask for a change"), its own avatar and name in replies.
- The bridge, the summary and the undo stack stay as built and read the panel's stream instead of the dock's snapshots. Each turn is one undo step.
- Every change the assistant decides on lands in the form. What cannot be applied, a skill whose integration is not connected or whose trigger does not fit, is left out and the reply says so. Nothing is held back for the person to accept on the page.
- Closed by default. A "Configure with agent" button in the header row of the instructions section, aligned to the right above the textarea, opens it; the visual editor has the same button in its chrome. The page opened from the home page's prompt box starts with the panel open.
- Leaving the page unmounts the panel. The turn finishes on the server and its reply is in the session when the person returns to that automation.
- The home page's prompt box creates the session and opens the new page with its id.
- The dock stays on automation pages, collapsed. Each surface hands off to the other in words: the localisation agent answers a setup request with a link to New automation, and the assistant answers a translation request by pointing at the dock.

### Page context per editor

- The form editor sends its form state and the agent gets the patch tool, as today.
- The visual editor sends its saved definition and the agent gets a tool that adds, configures and connects nodes. The tool returns the definition the page applies, so the canvas is changed by the page like the form is.

## Consequences

- The localisation agent, the chat route, turn preparation, the skill registry, the web channel, the dock store and stream manager, and the message list are untouched. The pull request is automation-scoped.
- The assistant never appears in the Inbox or the dock, and is private to its author, by construction.
- The page carries no suggestion state. A change is either in the form, and one undo away, or in the reply as something that was not done.
- Gone from the earlier branch: the skill activation rule, the chat route's context resolver, the classifier skip, the dock's context sending and turn tracking, and the scan of saved replies that found a chat's automation.
- Added: one enum value and two columns, a second agent package, four routes.
- Asking about an automation from the dock on another page is no longer possible. The agent could not act there anyway.
- Whether dock chats should be visible to teammates is a separate decision and is not changed here.

## Alternatives considered

- Keep the assistant a skill of the localisation agent, as built. It works, but the prompt grows with every page assistant, a reply can start from any page the dock restores on, sessions are team-visible, and the canvas would be a third context kind in the same prompt.
- The assistant as a kind of dock tab. One chat UI, but the two premises stay side by side in one place, the dock still starts replies on load, and the tab is meaningless off the automation page.
- Separate tables for sessions and messages. A cleaner schema, more code; the shared tables give persistence and history loading for nothing.
- Sessions that die with the page. Loses "continue tomorrow" and the record of what the assistant did; the web chat already persists its sessions.

## Out of scope

- Whether dock chats become visible to their author only.
- Held-back suggestions, where the assistant offers a change on the page with Use it, Add it or Dismiss instead of making it: a skill that declares a risk, or a change that would drop a skill or switch off a tool the person set. Left out of this first iteration; the risky skill is applied like any other and named in the reply, and the editor's own confirmation for a risky skill added by hand is unchanged.
- Moving the content editor's assistant, today the dock with a page context, to the same pattern.
- The stop button, and duplicate turns in the dock.
- The visual workflow tool itself; only where it plugs in.

## Not decided

- Shared or separate tables. Shared means a source value and two columns on `interactions`, reusing message storage, parts, the streaming save and the model-history loader, with the visibility helper and every conversation listing made to exclude that source. Separate means `assistant_sessions` and `assistant_messages` with their own writer and loader, where nothing can leak by omission. Proposed: shared, with a test that no conversation listing ever returns an assistant session.
- Billing: proposed the same per-turn charge as a dock turn, counted under the `surface` dimension. The usage decision is still open.

## Validation

Route tests cover access by role, author and organisation, one running turn, binding the automation id, and that no inbox item exists. Agent tests cover the tool set per editor context and the absence of the classifier and sandbox. Panel tests cover resuming a session by automation, a turn started only from the page, a reply that lands after the person left, and the hand-off links. The migration is applied to a database with existing conversations and the Inbox list is unchanged. In the real app: a new automation from the home page's prompt box, a saved automation edited and returned to later, two tabs on one automation, and the dock collapsed on the same page.
