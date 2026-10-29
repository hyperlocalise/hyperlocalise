# Multiple workspaces: create, accept and leave

**Status:** Accepted

Ships as one pull request (`feat/web-create-another-workspace`).

## Context

A person could make one workspace, at sign-up, and could join another only through the invitation email. Nobody could leave a workspace from the app: the Members page shows no actions on your own row. The last-admin check counted admin invitations nobody had accepted, and released its lock before WorkOS removed the membership, so two admins removing each other could leave none.

## Decision

- **Create.** "Create workspace" in the workspace menu and on the picker opens `/auth/new-workspace`, the onboarding form with `intent=another`, so a person who has a workspace can make another. Its Cancel returns to the workspace they came from.
- **Accept.** The picker lists a verified person's pending invitations (local pending membership rows) with **Accept**. Accepting checks the WorkOS invitation's email against the session's verified email, because WorkOS leaves that to the app; the newest invitation for that email decides. Someone with no workspace but an invitation is sent to the picker rather than "Invitation pending"; the picker and `/auth/new-workspace` accept a session with no workspace (`getAppAuthContextAllowingNoWorkspace`).
- **Leave.** "Leave workspace…" on your own row on the Members page. `GET /v1/orgs/{slug}/members/leave` lists the API keys that leaving revokes and the automations whose tools use a WorkOS Pipes connection of yours (`tool_config.<tool>.workosUserId`); `POST` leaves. Leaving logs `member_left`.
- **Last admin.** Removing, demoting or an admin leaving needs another admin who has accepted their invitation (a WorkOS membership id that is not a replacement marker), unless go-svc runs without WorkOS. The check takes a per-workspace advisory lock (`organization_admins:<org>`): admin changes take it exclusively, other removals share it, and the role is read again under the lock. The WorkOS removal runs inside that transaction, so a second admin change waits for it. Row locks were tried and dropped: page loads rewrite membership rows and would wait on WorkOS.
- **Session.** AuthKit renews a session for the workspace it was issued for, and switching workspaces only changes the address. After leaving, `finishLeavingWorkspaceAction` moves a session issued for the left workspace to the next one (`refreshSession({ organizationId })`), or signs out when none is left or the move fails; it returns where to go and the dialog loads that page in full.

## Consequences

- No limit on how many workspaces a person creates; each gets the default plan.
- Expired invitations stay listed until an admin withdraws them; Accept says they expired.
- Tasks and issues stay assigned to someone who leaves, and personal Crowdin, Phrase and Lokalise connections stay stored, as on removal.
- If the WorkOS webhook removes the row before go-svc does, the activity log shows "removed" rather than "left".
- A removal holds a database connection for the WorkOS call (at most 5 seconds).
