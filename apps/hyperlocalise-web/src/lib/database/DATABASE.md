# Database Schema

## Entity Relationship Diagram

```mermaid
erDiagram
    ORGANIZATIONS {
        uuid id PK
        text workos_organization_id UK
        text name
        text slug UK
        timestamptz created_at
        timestamptz updated_at
    }

    USERS {
        uuid id PK
        text workos_user_id UK
        text email UK
        text first_name
        text last_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    ORGANIZATION_MEMBERSHIPS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        text workos_membership_id UK
        text role "enum: owner, admin, member"
        timestamptz created_at
        timestamptz updated_at
    }

    TEAMS {
        uuid id PK
        uuid organization_id FK
        text slug
        text name
        timestamptz created_at
        timestamptz updated_at
    }

    TEAM_MEMBERSHIPS {
        uuid id PK
        uuid team_id FK
        uuid user_id FK
        text role "enum: manager, member"
        timestamptz created_at
        timestamptz updated_at
    }

    PROJECTS {
        text id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        text description
        text translation_context
        timestamptz created_at
        timestamptz updated_at
    }

    GLOSSARIES {
        uuid id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        text description
        text source_locale
        text target_locale
        text status "enum: draft, active, archived"
        timestamptz created_at
        timestamptz updated_at
    }

    GLOSSARY_TERMS {
        uuid id PK
        uuid glossary_id FK
        text source_term
        text target_term
        text description
        text part_of_speech
        boolean case_sensitive
        boolean forbidden
        text review_status
        jsonb metadata
        tsvector search_vector
        timestamptz created_at
        timestamptz updated_at
    }

    MEMORIES {
        uuid id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        text name
        text description
        text status "enum: draft, active, archived"
        timestamptz created_at
        timestamptz updated_at
    }

    MEMORY_ENTRIES {
        uuid id PK
        uuid memory_id FK
        text source_locale
        text target_locale
        text source_text
        text normalized_source_text
        text target_text
        integer match_score
        text provenance
        text external_key
        text review_status
        jsonb metadata
        tsvector search_vector
        timestamptz created_at
        timestamptz updated_at
    }

    PROJECT_GLOSSARIES {
        uuid id PK
        uuid organization_id FK
        text project_id FK
        uuid glossary_id
        integer priority
        timestamptz created_at
        timestamptz updated_at
    }

    PROJECT_MEMORIES {
        uuid id PK
        uuid organization_id FK
        text project_id FK
        uuid memory_id
        integer priority
        timestamptz created_at
        timestamptz updated_at
    }

    ORGANIZATION_LLM_PROVIDER_CREDENTIALS {
        uuid id PK
        uuid organization_id FK
        uuid created_by_user_id FK
        uuid updated_by_user_id FK
        text provider "enum: openai, anthropic, gemini, groq, mistral"
        text default_model
        text masked_api_key_suffix
        text encryption_algorithm
        text ciphertext
        text iv
        text auth_tag
        integer key_version
        timestamptz last_validated_at
        timestamptz created_at
        timestamptz updated_at
    }

    GITHUB_INSTALLATIONS {
        uuid id PK
        uuid organization_id FK
        bigint github_installation_id UK
        bigint github_app_id
        text account_login
        text account_type
        timestamptz created_at
        timestamptz updated_at
    }

    GITHUB_INSTALLATION_REPOSITORIES {
        uuid id PK
        uuid organization_id FK
        bigint github_installation_id
        bigint github_repository_id
        text owner
        text name
        text full_name
        boolean private
        boolean archived
        text default_branch
        boolean enabled
        timestamptz last_synced_at
        timestamptz created_at
        timestamptz updated_at
    }

    CONNECTORS {
        uuid id PK
        uuid organization_id FK
        text kind
        boolean enabled
        jsonb config
        timestamptz created_at
        timestamptz updated_at
    }

    TMS_LINKS {
        uuid id PK
        uuid organization_id FK
        text project_id FK
        text provider
        text external_account_id
        text external_project_id
        jsonb config
        timestamptz created_at
        timestamptz updated_at
    }

    JOBS {
        text id PK
        uuid organization_id FK
        text project_id FK
        uuid created_by_user_id FK
        uuid owner_user_id FK
        text kind "enum: translation, research, review, sync, asset_management"
        text status "enum: queued, running, succeeded, failed, waiting_for_review, cancelled"
        jsonb input_payload
        jsonb outcome_payload
        text last_error
        text workflow_run_id
        uuid interaction_id FK
        jsonb context_snapshot
        timestamptz created_at
        timestamptz updated_at
        timestamptz completed_at
    }

    TRANSLATION_JOB_DETAILS {
        text job_id PK,FK
        text type "enum: string, file"
        text outcome_kind "enum: string_result, file_result, error"
    }

    REVIEW_JOB_DETAILS {
        text job_id PK,FK
        text criteria
        text target_locale
        jsonb config
    }

    SYNC_JOB_DETAILS {
        text job_id PK,FK
        text connector_kind
        text direction
        jsonb external_identifiers
    }

    ASSET_MANAGEMENT_JOB_DETAILS {
        text job_id PK,FK
        text asset_type
        text operation
        jsonb config
    }

    INTERACTIONS {
        uuid id PK
        uuid organization_id FK
        text project_id FK
        text source "enum: chat_ui, email_agent, github_agent"
        text title
        text source_thread_id
        timestamptz last_message_at
        timestamptz created_at
        timestamptz updated_at
    }

    INBOX_ITEMS {
        uuid interaction_id PK,FK
        uuid organization_id FK
        text project_id FK
        text status "enum: active, archived"
        timestamptz created_at
        timestamptz updated_at
    }

    INTERACTION_MESSAGES {
        uuid id PK
        uuid interaction_id FK
        text sender_type "enum: user, agent"
        text sender_email
        text text
        jsonb attachments
        timestamptz created_at
    }

    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERSHIPS : has
    USERS ||--o{ ORGANIZATION_MEMBERSHIPS : belongs_to

    ORGANIZATIONS ||--o{ TEAMS : owns
    TEAMS ||--o{ TEAM_MEMBERSHIPS : has
    USERS ||--o{ TEAM_MEMBERSHIPS : belongs_to

    ORGANIZATIONS ||--o{ PROJECTS : owns
    USERS ||--o{ PROJECTS : created_by

    ORGANIZATIONS ||--o{ GLOSSARIES : owns
    USERS ||--o{ GLOSSARIES : created_by
    GLOSSARIES ||--o{ GLOSSARY_TERMS : contains

    ORGANIZATIONS ||--o{ MEMORIES : owns
    USERS ||--o{ MEMORIES : created_by
    MEMORIES ||--o{ MEMORY_ENTRIES : contains

    PROJECTS ||--o{ PROJECT_GLOSSARIES : uses
    GLOSSARIES ||--o{ PROJECT_GLOSSARIES : attached_to

    PROJECTS ||--o{ PROJECT_MEMORIES : uses
    MEMORIES ||--o{ PROJECT_MEMORIES : attached_to

    ORGANIZATIONS ||--o{ ORGANIZATION_LLM_PROVIDER_CREDENTIALS : configures
    USERS ||--o{ ORGANIZATION_LLM_PROVIDER_CREDENTIALS : created_by
    USERS ||--o{ ORGANIZATION_LLM_PROVIDER_CREDENTIALS : updated_by

    ORGANIZATIONS ||--|| GITHUB_INSTALLATIONS : installs
    GITHUB_INSTALLATIONS ||--o{ GITHUB_INSTALLATION_REPOSITORIES : contains

    ORGANIZATIONS ||--o{ CONNECTORS : has

    ORGANIZATIONS ||--o{ TMS_LINKS : has
    PROJECTS ||--o{ TMS_LINKS : linked

    ORGANIZATIONS ||--o{ JOBS : owns
    PROJECTS ||--o{ JOBS : contains
    USERS ||--o{ JOBS : created_by
    USERS ||--o{ JOBS : owned_by
    INTERACTIONS ||--o{ JOBS : spawned

    JOBS ||--|| TRANSLATION_JOB_DETAILS : extends
    JOBS ||--|| REVIEW_JOB_DETAILS : extends
    JOBS ||--|| SYNC_JOB_DETAILS : extends
    JOBS ||--|| ASSET_MANAGEMENT_JOB_DETAILS : extends

    ORGANIZATIONS ||--o{ INTERACTIONS : has
    PROJECTS ||--o{ INTERACTIONS : contains
    INTERACTIONS ||--|| INBOX_ITEMS : displays
    INTERACTIONS ||--o{ INTERACTION_MESSAGES : has

    ORGANIZATIONS ||--o{ INBOX_ITEMS : owns
    PROJECTS ||--o{ INBOX_ITEMS : contains
```
