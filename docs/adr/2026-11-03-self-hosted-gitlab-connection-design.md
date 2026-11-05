# Self-hosted GitLab connection

**Status:** Accepted

Ships as three stacked pull requests: store and check the connection, existing GitLab features use it, then the Integrations panel.

## Context

GitLab access goes through WorkOS Pipes, which holds each person's GitLab.com sign-in, and the client's address is fixed to `gitlab.com`. A company running its own GitLab server cannot connect.

## Decision

- **One connection per workspace.** Someone with `provider_credentials:write` (admins and localization managers) saves a server address and an access token in `gitlab_connections`. The token is encrypted the same way as other provider credentials and never returned. While a connection exists it replaces Pipes for all GitLab work in that workspace, so a project reference can't resolve against the wrong server. (A project sync or workflow Content sync step also keeps the project's id and refuses to run when the path on the current connection names another project.)
- **The token is required on every save.** A stored token can't be pointed at a new address.
- **Saving checks first.** The app asks the server who the token belongs to and lists one project. A failed check saves nothing and leaves any existing connection alone.
- **Addresses must be safe.** `https` only, no credentials in the address, and no name that resolves to a private address. Each request pins the checked address and refuses redirects. Clone addresses are built from the saved address, not from what the server reports, because a clone sends the token there.
- **Local servers.** A development build alone may use `localhost` or `127.0.0.1`, over `http` too, for testing against a server on the developer's machine.

## GitLab.com through the same connection (2026-11-05)

The Integrations row became the single **GitLab** row: an admin or localization manager chooses GitLab.com or a company server, so a GitLab.com workspace connects with a token the same way, and syncing files needs this connection either way. While the workspace has no connection, the per-member GitLab.com sign-in row (WorkOS Pipes) stays, named as a sign-in and described as serving chat and the automations that person creates; once a connection exists it is shown only to someone whose own sign-in is still stored, marked as not in use, so they can remove it. Because GitLab has no per-project switch like a GitHub App installation, the token's reach is the workspace's reach; the hint steers a GitLab.com workspace to a project or group access token or a dedicated account. Whether a GitLab.com workspace should instead keep members' own sign-ins for chat, or get an enabled-projects list, is an open product question recorded with the feature's review.

## Several named connections (2026-11-05)

A workspace can hold **several GitLab connections**, each with a name, so a project's sync can use a token scoped to its own repositories while chat and automations use another. This follows the connector list in other translation tools, where an administrator makes the connections once and a project picks one, rather than a token stored with each project.

- `gitlab_connections` loses its one-per-workspace rule and gains `name` (shown as the server's host when empty, for connections made before names) and `is_default`. At most one connection per workspace is marked default (partial unique index); when none is marked, the oldest one is the default, so existing workspaces keep working without a data change.
- **The default connection** is what chat, workspace automations and visual workflow Content sync steps use, and what "Connected" means on the Integrations row. An admin can mark any connection as the default.
- **A project sync names its connection** (`gitlabConnectionId` in its settings). Saving a GitLab sync in the Sync panel resolves the chosen connection, or the default when none was chosen, and stores its id, so changing the default later never moves a sync. A run whose connection was removed reports it and does nothing, until someone chooses another connection in the panel.
- **Removing a connection** asks for confirmation and says how many project syncs use it. Replacing its token, name or address keeps its id, so syncs follow it.
- Routes: `GET /gitlab/connections` lists the workspace's connections (never the tokens, with how many syncs use each); `POST /gitlab/connections` adds one; `PUT /gitlab/connections/:id` replaces one (token required, as before); `POST /gitlab/connections/:id/default` marks the default; `DELETE /gitlab/connections/:id` removes one; `GET /gitlab/connections/:id/check` runs the live check. `GET /gitlab/connection` keeps answering with the default connection for the parts of the app that only need to know whether GitLab is connected.
- The Sync panel's connections route takes the connection to list projects for, so a server is only asked for its projects when that connection is chosen.

## Consequences

- Everyone in the workspace who can use GitLab features acts through one token, so an admin decides what they can reach by choosing that token's access. This matches how a GitHub App installation works.
- Chats remember a project together with its server, and stop using it once the server is replaced or removed or its saved token can't be read. The chat then forgets the project and tells the person why, once. While a connection exists, links from another GitLab server pasted in chat get a reply saying they aren't used.
- Saved automations hold a project path, not a server. Replacing or removing a connection points those paths at the new server, or back at GitLab.com, so the panel warns before either.
- Fixed outgoing addresses are a separate concern for any integration, and are not part of this connection. A server that only accepts allow-listed addresses can't be reached until they exist.
- Agents still clone through a Vercel Sandbox with the token, so a server on a developer's machine works for everything except clones. Syncing files and opening merge requests go over REST instead: see [`2026-11-04-self-hosted-gitlab-content-sync-design.md`](./2026-11-04-self-hosted-gitlab-content-sync-design.md).
