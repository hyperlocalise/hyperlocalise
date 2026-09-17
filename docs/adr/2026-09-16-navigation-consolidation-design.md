# Consolidated Navigation Menu Design

Consolidate the Hyperlocalise workspace and project navigation into clean, symmetrical architectural areas: Overview & Projects, Workspace, Content Studio (inside projects), Content Intelligence, standalone Settings, and the preview "Try" section.

## Context

The workspace sidebar previously exposed 17+ flat and semi-grouped items (Inbox, My Jobs, Queries, Overview, Reports, New Request, Automations, AI Engine, Projects, Domains, Hyperlab, Guideline, Glossaries, Translation Memories, Integrations, Members, Settings), creating visual clutter and cognitive overhead.

## Decision

1. **Workspace Navigation Structure (Global)**:
   - **Promoted Items**: **Overview** (`/org/[slug]/dashboard`) and **Projects** (`/org/[slug]/projects`) sit promoted at the top as primary navigation anchors.
   - **Workspace (Section)**: Groups core day-to-day workflow and collaboration tools:
     - **Inbox** (`/org/[slug]/inbox`)
     - **My Jobs** (`/org/[slug]/my-work`)
     - **Queries** (`/org/[slug]/issues`)
     - **Reports** (`/org/[slug]/reports`, flag: `WORKSPACE_REPORTS_FLAG`)
   - **Content Intelligence (Section)**: Dedicated to linguistic and quality assets:
     - **Glossaries** (`/org/[slug]/glossaries`)
     - **Translation Memories** (`/org/[slug]/translation-memories`)
     - **Guideline** (`/org/[slug]/knowledge`, flag: `WORKSPACE_KNOWLEDGE_FLAG`)
   - **Settings**: Standalone entry point at the bottom (`/org/[slug]/settings`), consolidating General, Members, Teams, Integrations, AI Engine, Apps (Domains, Hyperlab), Billing, API Keys, Activity Logs, and Account.
   - **Try (Section)**: Preserved dynamically via `groupPreviewNavigationGroups` for items with disabled feature flags in preview mode.

2. **Project Navigation (Content Studio & Project Workspace)**:
   - Header: `< All Projects` and project name.
   - **Overview** (`/org/[slug]/projects/[projectId]`)
   - **Content Studio (Section)**: Dedicated to content authoring and editing:
     - **Files** (`/projects/[projectId]/files`)
     - **Content Editor** (`/projects/[projectId]/strings`, flag: `RELEASE_CAT_ALL_FILES_FLAG`)
     - **Video Editor** (disabled until `/projects/[projectId]/videos` exists, badge: "Coming soon")
   - **Workspace (Section)**: Mirrors the global workspace concept for project-scoped operations:
     - **Jobs** (`/projects/[projectId]/jobs`)
     - **Queries** (`/projects/[projectId]/issue-sheet`)
     - **Automations** (`/projects/[projectId]/automations`, flag: `WORKSPACE_AUTOMATIONS_FLAG`)
   - **Settings**: Standalone entry point at the bottom (`/projects/[projectId]/settings`).
   - **Try (Section)**: Preserved dynamically via `groupPreviewNavigationGroups` for project items with disabled flags.

3. **Settings Navigation**:
   - Inside Settings (`/org/[slug]/settings`):
     - **Workspace**: General (`/settings`), Activity Logs (`/settings/activity-logs`)
     - **Members & Teams**: Moved out of Workspace as its own standalone item/group (`/settings/members`)
     - **Integrations & AI**: Integrations (`/settings/integrations`), AI Engine (`/settings/ai-engine`)
     - **Apps & Features**: Domains (`/settings/domains`), Hyperlab (`/settings/hyperlab`)
     - **Billing**: Billing (`/settings/billing`)
     - **Developer**: API Keys (`/settings/api-keys`)
     - **You**: Account (`/settings/account`)

## Consequences

- Global workspace sidebar is streamlined and focused: Overview and Projects are prominent top-level anchors, day-to-day triage is grouped under Workspace, linguistic governance lives under Content Intelligence, and administration lives under Settings.
- Within Settings, Members & Teams is treated with first-class prominence rather than grouped under Workspace.
- Within each project, authoring tools live in Content Studio, operational tasks live in Workspace, and settings stands alone.
