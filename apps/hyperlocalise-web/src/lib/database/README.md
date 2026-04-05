# Database Schema

This folder contains the Drizzle schema for the app database.

## Design

- `organizations`, `users`, and `organization_memberships` are local identity tables.
- WorkOS IDs are stored as external mapping fields so domain tables do not depend on vendor IDs.
- `translation_projects` belongs to an organization and may record the creating user.
- `translation_jobs` belongs to a project and may record the triggering user.

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
    users ||--o{ organization_memberships : joins
    organizations ||--o{ translation_projects : owns
    users ||--o{ translation_projects : creates
    translation_projects ||--o{ translation_jobs : contains
    users ||--o{ translation_jobs : triggers
```

## Notes

- `organization_memberships` is the authorization join table between users and organizations.
- `translation_projects` and `translation_jobs` reference local UUIDs for users and organizations, not WorkOS IDs.
- WorkOS remains an upstream identity provider; the app database remains the primary source for relational integrity.
