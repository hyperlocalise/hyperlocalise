# Hyperlocalise Domain Model

Core domain entities and navigation concepts across Hyperlocalise.

## Navigation & Workspaces

**Overview**:
The workspace dashboard providing high-level status, metrics, and health summary.
_Avoid_: Dashboard, Home

**Projects**:
Top-level standalone container for translation projects, each hosting its own project-level Content Studio.
_Avoid_: Content Studio (at the workspace level)

**Workspace**:
The primary operational section containing core collaboration and project management tools (Inbox, My Jobs, Queries, Reports at the workspace level; Jobs, Queries, Automations at the project level).
_Avoid_: Core, Triage, Operations

**Content Studio**:
The dedicated project-level section grouping content creation and editing tools (Files, Content Editor, Video Editor).
_Avoid_: Translation Studio, Production

**Content Intelligence**:
The linguistic and quality hub providing terminology, memory assets, guidelines, and dictionaries (Glossaries, Translation Memories, Guideline, Dictionaries).
_Avoid_: Insights, Analytics, Knowledge Hub

**Settings**:
The standalone administration area for workspace configuration, team membership, integrations, AI engine, apps (Domains, Hyperlab), billing, and developer keys.
_Avoid_: Administration, Preferences, Workspace Management

**Try**:
The system-managed preview section gathering navigation items whose feature flags are disabled in the current workspace.
_Avoid_: Beta, Preview Hub

## Linguistic Assets

**Glossaries**:
Structured collections of terminology with preferred, allowed, and forbidden translations.
_Avoid_: Terms, Lexicon

**Translation Memories**:
Databases of previously translated text segments paired with source strings.
_Avoid_: TM, Translation Database

**Guideline**:
Brand voice, formatting rules, and style guidance provided to human translators and AI agents.
_Avoid_: Knowledge, Style Guide, Knowledge Base

**Dictionaries**:
Spellcheck and morphological word lists used by editors and agents to validate localized text.
_Avoid_: Word lists, Spellcheckers
