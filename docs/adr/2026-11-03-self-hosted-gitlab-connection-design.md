# Self-hosted GitLab connection

**Status:** Accepted

Ships as three stacked pull requests: store and check the connection, existing GitLab features use it, then the Integrations panel.

## Context

GitLab access goes through WorkOS Pipes, which holds each person's GitLab.com sign-in, and the client's address is fixed to `gitlab.com`. A company running its own GitLab server cannot connect.

## Decision

- **One connection per workspace.** Someone with `provider_credentials:write` (admins and localization managers) saves a server address and an access token in `gitlab_connections`. The token is encrypted the same way as other provider credentials and never returned. While a connection exists it replaces Pipes for all GitLab work in that workspace, so a project reference can't resolve against the wrong server.
- **The token is required on every save.** A stored token can't be pointed at a new address.
- **Saving checks first.** The app asks the server who the token belongs to and lists one project. A failed check saves nothing and leaves any existing connection alone.
- **Addresses must be safe.** `https` only, no credentials in the address, and no name that resolves to a private address. Each request pins the checked address and refuses redirects. Clone addresses are built from the saved address, not from what the server reports, because a clone sends the token there.
- **Local servers.** A development build alone may use `localhost` or `127.0.0.1`, over `http` too, for testing against a server on the developer's machine.

## Consequences

- Everyone in the workspace who can use GitLab features acts through one token, so an admin decides what they can reach by choosing that token's access. This matches how a GitHub App installation works.
- Chats remember a project together with its server, and stop using it once the server is replaced or removed or its saved token can't be read. The chat then forgets the project and tells the person why, once. While a server is connected, GitLab.com links pasted in chat get a reply saying they aren't used.
- Saved automations hold a project path, not a server. Replacing or removing a connection points those paths at the new server, or back at GitLab.com, so the panel warns before either.
- Fixed outgoing addresses are a separate concern for any integration, and are not part of this connection. A server that only accepts allow-listed addresses can't be reached until they exist.
- Agents still clone through a Vercel Sandbox with the token, so a server on a developer's machine works for everything except clones. Syncing files and opening merge requests go over REST instead: see [`2026-11-04-self-hosted-gitlab-content-sync-design.md`](./2026-11-04-self-hosted-gitlab-content-sync-design.md).
