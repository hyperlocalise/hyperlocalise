# Hyperlocalise Product Architecture

This document defines the north-star product architecture for Hyperlocalise Web. It is a product contract for future work, not a snapshot of what is fully implemented today.

Hyperlocalise is an agentic localisation platform. Users can work through web chat or through external agents such as email, Slack, Linear, GitHub, and TMS integrations. Every interaction enters a shared inbox. From that interaction, users or agents can create jobs such as translation, review, research, or localisation asset management.

## Product Principles

- **One intake model.** Chat, email, Slack, Linear, GitHub, and future connectors should all create the same product object: an inbox-backed interaction.
- **Jobs are the unit of work.** Any meaningful agent task should become a job with clear inputs, status, ownership, output, and traceability.
- **Projects carry context, not workflow.** A project defines the product, brand, domain, locale expectations, and attached assets. Jobs decide what work happens.
- **Memory and terminology are reusable assets.** Translation memories and glossaries belong to the workspace and can apply to one or many projects.
- **The TMS stays part of the workflow.** Hyperlocalise should orchestrate work with existing TMS platforms instead of forcing teams to replace them.
- **Humans stay in control.** Agents can draft, research, review, suggest updates, and sync systems, but important output should remain inspectable and reversible.

## Example Scenarios

**A product manager uses web chat.** They paste release notes into Hyperlocalise and ask for Japanese and Vietnamese translations for the mobile app project. Hyperlocalise creates an inbox item, attaches the interaction to the project, creates translation jobs, retrieves the project's context, uses the relevant translation memories and glossaries, then returns draft strings with job status and review options.

**A marketer uses the email agent.** They email a campaign JSON file to the organisation's inbound address and ask for French translation. Hyperlocalise creates an inbox item from the email, stores the file as source input, creates a file translation job, applies the selected project's context and terminology, then replies with the translated file and a link to inspect the job in the web app.

**An engineer works from GitHub or Linear.** They mention Hyperlocalise on a pull request or issue and ask whether changed strings are ready for release. Hyperlocalise creates an inbox item, starts a research or review job, compares changed strings against project context, TM, glossary, and TMS state, then comments back with findings, suggested fixes, or follow-up translation jobs.

## Core Domain Model

### Workspace

A workspace is the tenant boundary for users, projects, inbox items, jobs, connectors, credentials, translation memories, and glossaries. Access control should be enforced at the workspace boundary first.

### Project

A project represents a product, app, site, documentation set, campaign, or other localisation surface. A project can have optional context, including:

- Product and audience description
- Brand voice and writing rules
- Source locale and target locale preferences
- Formatting, placeholder, and accessibility rules
- Links to attached translation memories and glossaries
- Links to TMS projects, repositories, or source systems

Project context should be loaded into jobs when relevant, but users should be able to run workspace-level jobs that do not belong to a project.

### Interaction

An interaction is a conversation or event thread between a user, an agent, and a channel. Web chat, inbound email, Slack threads, Linear issues, GitHub comments, and TMS events should all map to interactions.

Each interaction should have:

- Source channel
- Workspace
- Optional project
- Participants or source identities
- Messages, events, attachments, and links
- Created jobs
- Current status

### Inbox Item

An inbox item is the operational view of an interaction. It lets users triage, assign, resolve, archive, or continue work regardless of where the interaction started.

Product rule: every interaction creates exactly one inbox item. A single inbox item can contain many messages and many jobs.

### Job

A job is a durable unit of work created by a user, agent, workflow, or integration. Jobs can be created from an inbox item, directly from a project, from a TMS event, or from an automation.

Every job should have:

- Kind, such as translation, review, research, sync, or asset management
- Status, such as queued, running, waiting for review, succeeded, failed, or cancelled
- Workspace and optional project
- Source interaction or system trigger
- Inputs, context snapshot, outputs, errors, and audit trail
- Agent or human owner when applicable

Translation jobs should support both string and file inputs. Review jobs should support human review, agent review, and TMS review loops. Research jobs should collect localisation context, market context, or terminology evidence. Asset management jobs should create, update, dedupe, import, or export TMs and glossaries.

### Translation Memory

A translation memory is a reusable set of accepted source and target segment pairs. It belongs to a workspace and can attach to one or many projects.

Translation memories should support:

- Exact, fuzzy, and eventually semantic lookup
- Locale-pair filtering
- Provenance, such as manual, import, TMS sync, or approved job output
- Project attachment with priority
- Import and export through TMS or file workflows

### Glossary

A glossary is a reusable terminology asset. It belongs to a workspace and can attach to one or many projects.

Glossaries should support:

- Source term, target term, description, part of speech, and forbidden terms
- Locale-pair filtering
- Case sensitivity and matching rules
- Project attachment with priority
- Agent suggestions and human approval before broad application

### TMS Link

A TMS link connects Hyperlocalise to an external translation management system. The TMS may be the system of record for translation tasks, review status, assets, or final approved content.

TMS links should support:

- Mapping Hyperlocalise workspaces and projects to TMS accounts and projects
- Pulling source strings, files, review state, TMs, and glossaries
- Creating or updating TMS jobs
- Pushing translated output and review suggestions
- Syncing approved translations back into Hyperlocalise assets

## Interaction And Inbox Lifecycle

All channels should follow the same lifecycle:

1. A user or external system sends a message, event, file, issue, or comment.
2. Hyperlocalise creates or resumes an interaction.
3. Hyperlocalise creates or updates the inbox item for that interaction.
4. The agent determines intent and gathers project, TM, glossary, connector, and TMS context.
5. The agent creates one or more jobs when durable work is required.
6. Jobs run through workflow execution, human review, TMS review, or external sync.
7. The interaction records the result, and the inbox item remains open, resolved, or archived.

The inbox should be the user's source of truth for "what needs attention". The jobs list should be the source of truth for "what work is running or complete".

## Job Architecture

Jobs should be typed at the top level and extended by kind-specific details. The shared job model should handle queueing, ownership, state transitions, retries, errors, outputs, and audit history. Kind-specific records should hold translation details, review criteria, research scope, or asset-management instructions.

Recommended job kinds:

- **Translation:** translate strings or files into one or more target locales.
- **Review:** inspect translations for quality, consistency, terminology, tone, formatting, or release readiness.
- **Research:** gather context, terminology, market guidance, competitor wording, or locale-specific constraints.
- **Sync:** pull from or push to repositories, TMS platforms, and other systems.
- **Asset management:** create, import, export, dedupe, or update TMs and glossaries.

Jobs should not depend on the channel that created them. A translation job from email and a translation job from chat should use the same core execution model.

## Context Retrieval

Before executing a job, Hyperlocalise should assemble a context packet. The packet should be explicit and inspectable so users can understand why an agent made a decision.

The context packet may include:

- Project context
- User-provided instructions
- Source files, strings, or changed content
- Relevant TM matches
- Relevant glossary terms
- TMS state and review history
- Connector-specific context, such as a GitHub diff or Linear issue
- Output constraints, such as file format, placeholders, ICU syntax, and max length

The context packet should be stored or reconstructable for important jobs so reviews and retries are explainable.

## File And String Translation

Hyperlocalise must support both file and string translation.

String translation should handle direct text, UI strings, key-value resources, and changed strings from source control. It should preserve placeholders, variables, ICU syntax, markup, and length constraints.

File translation should handle uploaded files, email attachments, repository files, and TMS files. It should preserve structure, metadata, encodings, and supported formats. File jobs should produce downloadable outputs and, when applicable, structured segment-level results for review and TM updates.

## Agent And Connector Model

Agents are product actors that can read interactions, gather context, create jobs, call tools, and respond through the originating channel.

Connectors are channel or system integrations. Examples include:

- Web chat
- Email
- Slack
- Linear
- GitHub
- TMS platforms
- Source repositories
- File storage

Agents should use connectors through a consistent capability model: read context, create response, attach file, create job, update external state, and sync assets. New connectors should not introduce new product concepts unless the core model cannot represent the workflow.

## TMS Collaboration

The TMS integration should cover three modes:

- **Job mode:** create, update, or inspect TMS jobs from Hyperlocalise.
- **Review mode:** read reviewer state, push draft translations, import comments, and surface blockers in the inbox.
- **Asset mode:** import, export, update, and reconcile translation memories and glossaries.

When the TMS is connected, Hyperlocalise should respect the TMS as the source of truth for approved translations unless the user chooses another operating model for that project.

## Human Review And Control

Users should be able to:

- Inspect the interaction that created a job
- Inspect job inputs, context, output, and errors
- Approve or reject agent suggestions
- Send output to the TMS or pull review state back
- Promote approved translations into TM
- Promote approved terminology into glossaries
- Re-run jobs with revised instructions

Agent-created TM and glossary updates should be suggestions by default unless a workspace explicitly enables automatic updates.

## Product Boundaries

Hyperlocalise is responsible for intake, orchestration, context assembly, agent execution, review visibility, and asset management.

Hyperlocalise should not hide external systems. If a job depends on GitHub, Linear, Slack, email, or a TMS, the product should keep the source link visible and preserve enough external identifiers to reconcile state.

The web app should provide the canonical operational UI. External agents should be convenient entry points, not separate products.

## Future Product Rules

- If a feature starts from a user message, event, or external trigger, model it as an interaction and inbox item.
- If a feature performs durable work, model it as a job.
- If a feature changes translation quality over time, connect it to project context, TM, glossary, review history, or TMS state.
- If a feature introduces a new channel, implement it as a connector and reuse the interaction, inbox, and job model.
- If a feature creates reusable localisation knowledge, store it as an explicit asset with provenance and review state.
- If a feature touches user-facing translations, preserve source links, context, and auditability.
