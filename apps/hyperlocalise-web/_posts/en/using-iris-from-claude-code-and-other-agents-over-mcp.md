---
title: "Using Iris from Claude Code, Cursor and Other Agents over MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Connect Claude Code, Cursor, or Codex to Iris over MCP to localise images, subtitle and dub video, and check every market against your glossary.
category: Engineering
tags:
  - Iris
  - MCP
  - Model Context Protocol
  - Claude Code
  - Cursor
  - AI agents
  - creative localisation
  - video localisation
  - image localisation
  - localisation
  - localization
  - agentic workflows
---

Coding agents have become very good at product localisation. They extract strings, wire up `react-intl`, open pull requests and check plurals. We've written about that workflow for [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) and for [React Intl and ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Then the release needs a launch video, a set of social banners and a product demo in six languages, and the agent can't help. Creative tools are built around a person clicking through a timeline or a canvas. There's nothing for an agent to call.

**[Iris](/iris)** works differently. Every capability in the app is also an MCP tool. Connect your agent once, and it can open creatives, read the copy in an image, localise it for each market, subtitle and dub a video, check layouts, and read your glossary and translation memory. The work happens in the Iris app on your Mac, so you can watch it and step in at any point.

This post covers what that looks like, how to connect, and how to give an agent a creative localisation task it can actually finish.

## Why MCP access matters for creative work

Most creative tools offer an export button, and some offer an API for a single job such as "translate this subtitle file". Neither lets an agent run the whole workflow.

Localising one creative is a chain of decisions: read the copy, look up the approved terms, translate, redraw or re-time, check every market, fix what broke, and ask a person to approve. An agent can only own that chain if it can reach every link.

Iris makes all of it available. The server lists its full toolset to any connected agent, with each tool's inputs and outputs described as JSON Schema. It also includes the same skill pages Iris's built-in assistant uses, covering localisation, video editing, motion graphics and terminology, so the agent learns the right workflow before it starts rather than guessing.

That means you can hand off an outcome ("localise this campaign for France, Germany and Japan") instead of listing every step.

## What an agent can do through Iris

| Area | What the agent can do |
| --- | --- |
| **Images** | Read the copy baked into a banner or social ad, translate it, and redraw the approved copy for each market |
| **Video** | Rebuild a finished video's on-screen text, translate it, and generate subtitles timed like the original |
| **Voice** | Dub speech in the speakers' own voices, generate new voiceovers per market, and sync lip movement |
| **Terminology** | Look up glossary terms, approved and forbidden translations, and translation memory for any copy |
| **Guidelines** | Check copy against your uploaded brand and compliance documents, with findings that cite the source |
| **Quality** | Check each market for overflowing text, captions that spill off screen and missing characters, and preview the frames with the most copy |
| **Workspace** | Read localisation projects, jobs, QA reports and automations in your Hyperlocalise workspace |

The agent uses the same glossaries and translation memory as everyone else in your workspace. When it localises a banner, approved terms are applied and forbidden terms are blocked, just as they would be for a person using the app.

## Connect your agent

Iris runs its MCP server locally while the app is open. It's only reachable from your own machine, at a fixed address:

```text
http://127.0.0.1:4747/mcp
```

### The quick way

In Iris, open **Connect agents via MCP**. Iris detects the agents installed on your Mac and writes the server into each one's config with **Connect**. It supports Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode and several others.

### By hand

If you'd rather add it yourself, register an HTTP MCP server named `hyperlocalise-iris`. For Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

For Cursor, add it to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Clients that can only launch local command-line servers can reach the URL through a generic bridge such as `mcp-remote`.

### Check the connection

With Iris open, ask your agent:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

It should describe what's on screen in the app. If the tools are missing, make sure Iris is running. The server only exists while the app is open.

> **Iris's MCP server is different from the hosted [Hyperlocalise MCP server](/use-cases/localisation-for-ai-coding-agents).** The hosted server at `hyperlocalise.com/mcp` gives agents your projects, source files and translation keys from anywhere. Iris's local server adds creative work (images, video and voice) on your Mac. Many teams connect both.

## Give the agent a task it can finish

Agents do their best work with a clear outcome, a defined scope and a point where a person checks the result. Some prompts that work well:

**Localise a banner**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Subtitle a product video**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Check copy before it ships**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Turn a release into launch assets**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

That last one is where this gets interesting. The same agent that shipped the feature can produce the launch assets in every market, using the same terminology the product uses.

## Keep a person in the loop

Iris is built so the agent does the work and a person approves it.

- **The work is visible.** The agent works in the Iris app on your Mac, so you can see creatives change as it goes and step in at any point.
- **Previews before exports.** Agents are guided to show preview frames and leave the final export until you ask for it.
- **Glossary changes need agreement.** Agents are guided to confirm a new glossary term with you before adding it, rather than quietly changing your termbase.
- **Approvals teach the workspace.** When you approve a market, the approved copy goes into workspace memory, so the next agent run starts from it.

That's the same principle behind every Hyperlocalise workflow, which we covered in [Should You Build Your Own Localisation Agent?](/blog/should-you-build-your-own-localisation-agent): the hard part isn't generating output, it's keeping context, protecting quality and learning from human feedback.

## Get started

1. **[Download Iris](/iris)** for Mac. It's free; generation uses AI credit included in paid plans from $20 a month.
2. Open **Connect agents via MCP** and connect the agents you use.
3. Ask your agent to localise one asset you're shipping this month.

New to Iris? Start with the [launch post](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets), or read [How to Localise Image Ads and Social Creatives for Every Market](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) for the workflow your agent will follow.
