# Database Schema

This folder contains the Drizzle schema for the app database.

## Design

- `organizations`, `users`, and `organization_memberships` are local identity tables.
- `teams` and `team_memberships` are local collaboration tables nested under organizations.
- WorkOS IDs are stored as external mapping fields so domain tables do not depend on vendor IDs.
- `translation_projects` belongs to an organization and may record the creating user.
- `translation_jobs` belongs to a project and may record the triggering user.
- `translation_glossaries` and `translation_memories` are reusable organization-level translation assets.
- `translation_project_glossaries` and `translation_project_memories` attach those reusable assets to individual projects.
- `translation_projects.translation_context` remains the project-scoped freeform context field.

## Table Relationships

```mermaid
erDiagram
    organizations {
        uuid id PK
        text workos_organization_id UK
        text name
        text slug
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        uuid id PK
        text workos_user_id UK
        text email UK
        text first_name
        text last_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    organization_memberships {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        text workos_membership_id UK
        enum role
        timestamptz created_at
        timestamptz updated_at
    }

    teams {
        uuid id PK
        uuid organization_id FK
        text slug
        text name
        timestamptz created_at
        timestamptz updated_at
    }

    team_memberships {
        uuid id PK
        uuid team_id FK
        uuid user_id FK
        enum role
        timestamptz created_at
        timestamptz updated_at
    }

    translation_projects {
        text id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        text description
        text translation_context
        timestamptz created_at
        timestamptz updated_at
    }

    translation_glossaries {
        uuid id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        text source_locale
        text target_locale
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    translation_glossary_terms {
        uuid id PK
        uuid glossary_id FK
        text source_term
        text target_term
        bool case_sensitive
        bool forbidden
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    translation_memories {
        uuid id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        enum status
        timestamptz created_at
        timestamptz updated_at
    }

    translation_memory_entries {
        uuid id PK
        uuid translation_memory_id FK
        text source_locale
        text target_locale
        text source_text
        text normalized_source_text
        text target_text
        integer match_score
        timestamptz created_at
        timestamptz updated_at
    }

    translation_project_glossaries {
        uuid id PK
        text project_id FK
        uuid glossary_id FK
        integer priority
        timestamptz created_at
        timestamptz updated_at
    }

    translation_project_memories {
        uuid id PK
        text project_id FK
        uuid translation_memory_id FK
        integer priority
        timestamptz created_at
        timestamptz updated_at
    }

    translation_jobs {
        text id PK
        text project_id FK
        uuid created_by_user_id FK
        enum type
        enum status
        jsonb input_payload
        enum outcome_kind
        jsonb outcome_payload
        text last_error
        text workflow_run_id
        timestamptz created_at
        timestamptz updated_at
        timestamptz completed_at
    }

    organizations ||--o{ organization_memberships : has
    organizations ||--o{ teams : has
    users ||--o{ organization_memberships : joins
    teams ||--o{ team_memberships : has
    users ||--o{ team_memberships : joins
    organizations ||--o{ translation_projects : owns
    organizations ||--o{ translation_glossaries : owns
    organizations ||--o{ translation_memories : owns
    users ||--o{ translation_projects : creates
    users ||--o{ translation_glossaries : creates
    users ||--o{ translation_memories : creates
    translation_glossaries ||--o{ translation_glossary_terms : contains
    translation_memories ||--o{ translation_memory_entries : contains
    translation_projects ||--o{ translation_project_glossaries : attaches
    translation_projects ||--o{ translation_project_memories : attaches
    translation_glossaries ||--o{ translation_project_glossaries : attached_to
    translation_memories ||--o{ translation_project_memories : attached_to
    translation_projects ||--o{ translation_jobs : contains
    users ||--o{ translation_jobs : triggers
```

## Notes

- `organization_memberships` is the authorization join table between users and organizations.
- `teams` are local app-level subgroups inside an organization; WorkOS does not manage them.
- `team_memberships` controls collaboration inside an organization after org membership is established.
- `translation_projects` and `translation_jobs` reference local UUIDs for users and organizations, not WorkOS IDs.
- Reusable translation assets are owned at the organization layer, then attached to projects through join tables with `priority`.
- Glossary and TM content are normalized into term and entry tables.
- Project-specific freeform guidance should continue to use `translation_projects.translation_context`.
- WorkOS remains an upstream identity provider; the app database remains the primary source for relational integrity.
