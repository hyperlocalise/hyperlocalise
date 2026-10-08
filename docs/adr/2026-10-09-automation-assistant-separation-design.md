# Automation assistant as its own agent, sessions and panel

## Status

Accepted on 2026-10-09. Built the same day on `feat/web-automations-assistant-2`; not yet checked in the real app.

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

- Sessions and their messages have their own tables, `automation_assistant_sessions` and `automation_assistant_messages`. A session row holds its organisation, its author, the automation it is about, when it expires and whether a turn is running; the author is required. Nothing is written to the conversation tables, so the Inbox list, the conversation routes and anything later built on conversations cannot return a session.
- Access is its own check: same organisation, operator role, author. No one else can read or continue a session.
- One session per saved automation and author, resumed when that person opens the automation's page. Two operators working on one automation each have their own. A session for a new automation gets its automation id when Create succeeds; until then it is bound to nothing. Deleting an automation deletes its sessions.
- An unbound session is thrown away with the page: it is never resumed, a new page always starts a fresh one, and the server forgets unbound sessions after a day through an `expires_at` column, deleting the person's expired ones when they start the next. A turn still running when the page is left finishes into the abandoned session and is never shown; the unsaved setup it described is gone with the page anyway. No request is sent on unload, because none is reliable there.
- A message is stored with its parts, so a resumed session can show what each turn changed. The session's history comes from its own small loader: the newest fifty messages of the session, text only, the same cap the dock's loader uses. The shared loader is not used because it keeps the oldest fifty instead.
- An assistant turn writes nothing to the workspace activity log. The assistant saves nothing, and the person's Save is logged already.

### Agent

- A package `src/agents/automation-assistant/agent/` with today's setup skill text as its instructions, the setup tool, project lookup, and later a visual workflow tool. No repository classifier, no sandbox, no subagents, no translation or web tools, a small step limit.
- The same model resolver, so the gateway and customer keys apply.
- Billing follows the dock. The same usage reservation gates each turn on the AI-features entitlement, draws one agent run and records the tokens, with its own operation key and a `surface` dimension so assistant turns can be counted apart. The usage record names the session in its dimensions; it has no conversation to link to. Every paying plan includes AI features; on a plan without them the panel shows the dock's Upgrade plan button in place of the composer.

### Routes

- Under the automations API: create a session (optional automation id), stream a turn (the chat transport's message shape and the page context), get the session for an automation or by id, bind an automation id after Create, and delete a session for Start over.
- A session runs one turn at a time. The running turn is recorded on the row before any work starts; a second start answers 409 and the page shows the turn in progress.
- The turn runner is a copy of the web channel's streaming helper, cut down to what the assistant needs, so the dock's channel stays untouched.

### Panel

- Mounted by the form editor and the visual editor, built from the existing composer and message list. Its own small store: session id, messages, stream status. No tabs, no local-storage restore, no reply started by a page load. A turn begins only when someone sends from that page.
- A panel beside the editor on a wide screen and a sheet from the right edge on a narrow one. Never floating and never bottom-right, so it cannot be taken for the dock. Opening it folds the dock's panel away.
- Titled "Automation assistant" with the automation's name, its own empty state ("Describe what this automation should do, or ask for a change"), its own avatar and name in replies.
- The bridge, the summary and the undo stack stay as built and read the panel's stream instead of the dock's snapshots. Each tool call that changed the form is one undo step, sealed off from the typing around it, and undoing one asks first; a turn with one call is one step.
- Every change the assistant decides on lands in the form. What cannot be applied, a skill whose integration is not connected or whose trigger does not fit, is left out and the reply says so. Nothing is held back for the person to accept on the page.
- Closed by default. A "Configure with agent" button in the header row of the instructions section, aligned to the right above the textarea, opens it. The visual editor's button waits for its tool. The page opened from the home page's prompt box starts with the panel open.
- A "Start over" action in the panel deletes the session; the next message begins a new one. So a session on a saved automation does not grow for the automation's lifetime.
- Leaving the page unmounts the panel. The turn finishes on the server and its reply is in the session when the person returns to that automation.
- A tool output is applied by the tab whose panel ran the turn, as it streams. A page that resumes a session shows its history and applies nothing from it: the form is the saved automation as it is, and the reply text says what was done. A second tab on the same automation sees the running turn and waits.
- The home page's prompt box keeps the request in session storage and opens the new page, which creates the session on that first send once it knows its integrations. No session exists for a page the person never reaches, and a request older than five minutes is dropped.
- The dock stays on automation pages, collapsed. Each surface hands off to the other in words: the localisation agent answers a setup request with a link to New automation, and the assistant answers a translation request by pointing at the dock.

### Page context per editor

- The form editor sends its form state and the agent gets the patch tool, as today.
- The visual editor sends its saved definition and the agent gets a tool that adds, configures and connects nodes. The tool returns the definition the page applies, so the canvas is changed by the page like the form is.

### Roll-out

- On for every workspace with automations, behind the one switch the code already has. No new feature flag.

## Consequences

- The chat route, turn preparation, the skill registry, the web channel, the dock store and stream manager, and the message list are untouched. The localisation agent changes by one line of skill text, so that it answers a request to build an automation with a link to New automation. The pull request is otherwise automation-scoped.
- The assistant never appears in the Inbox or the dock, and is private to its author, by construction.
- The page carries no suggestion state. A change is either in the form, and one undo away, or in the reply as something that was not done.
- Gone from the earlier branch: the skill activation rule, the chat route's context resolver, the classifier skip, the dock's context sending and turn tracking, and the scan of saved replies that found a chat's automation.
- Added: two tables, a second agent package and its routes. The conversation tables, their source list and the Inbox's client are unchanged.
- The assistant's messages do not count as conversation messages in product analytics, and a later change to how conversations store messages does not reach the assistant.
- Asking about an automation from the dock on another page is no longer possible. The agent could not act there anyway.
- Whether dock chats should be visible to teammates is a separate decision and is not changed here.

## Alternatives considered

- Keep the assistant a skill of the localisation agent, as built. It works, but the prompt grows with every page assistant, a reply can start from any page the dock restores on, sessions are team-visible, and the canvas would be a third context kind in the same prompt.
- The assistant as a kind of dock tab. One chat UI, but the two premises stay side by side in one place, the dock still starts replies on load, and the tab is meaningless off the automation page.
- Sessions as rows of the conversation tables, with a new source, assistant-only columns and no inbox item. This was the first decision and was built first. It reused less than expected: the assistant has its own history loader, routes and turn runner, so the sharing came down to one insert helper and the usage record's link to the conversation. In return, privacy depended on every reader of those tables joining the inbox item or checking the source, four columns meant nothing to any other source, the author column took a name conversations may one day want for themselves, and the Inbox's client needed a filter for a source the server never sends it. Replaced with separate tables before anything was pushed.
- Sessions that die with the page. Loses "continue tomorrow" and the record of what the assistant did; the web chat already persists its sessions.

## Out of scope

- Whether dock chats become visible to their author only.
- Held-back suggestions, where the assistant offers a change on the page with Use it, Add it or Dismiss instead of making it: a skill that declares a risk, or a change that would drop a skill or switch off a tool the person set. Left out of this first iteration; the risky skill is applied like any other and named in the reply, and the editor's own confirmation for a risky skill added by hand is unchanged.
- Moving the content editor's assistant, today the dock with a page context, to the same pattern.
- The stop button, and duplicate turns in the dock.
- The visual workflow tool itself; only where it plugs in.

## Built

Commits on the branch, in order: the sessions and migration; the proposal logic picked from the earlier branch and its assistant module trimmed of held-back and chat-target code; the agent package, turn runner and routes; the panel, provider, summary, home-page section and page wiring; the tests; then the move of sessions and messages from the conversation tables to their own, with the migration regenerated in place and a test of the turn runner. Checked with `vp check --fix` and the automations, agents, routes, dock, inbox and undo-stack test suites. Not done: the visual editor's button and tool, the live eval, and a check in the real app.

## Validation

Route tests cover access by role, author and organisation, one running turn, binding the automation id, and that a session is no conversation: no conversation row exists for it, no listing returns it and the conversation route answers 404 for its id. A turn runner test, with a scripted model, covers both sides of a turn being saved with the tool's output, one billed run that names the session, and the turn being released when the model fails. Agent tests cover the tool set per editor context and the absence of the classifier and sandbox. Panel tests cover resuming a session by automation, a turn started only from the page, a reply that lands after the person left, and the hand-off links. The migration only creates the two tables and changes no existing one. In the real app: a new automation from the home page's prompt box, a saved automation edited and returned to later, two tabs on one automation, and the dock collapsed on the same page.
