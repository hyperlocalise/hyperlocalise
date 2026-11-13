/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "@formatjs/intl";

export function getUseCaseRouteMetadata(slug: string, intl: IntlShape) {
  switch (slug) {
    case "localisation-operations":
      return {
        title: intl.formatMessage({
          defaultMessage: "Run Your Whole Localisation Programme From One Place | Hyperlocalise",
          id: "natn/0IuYN",
          description: "Page title for the localisation-operations use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Bring requests, vendors, reviewers, AI models, and your TMS into one workflow. See what is in flight, what is blocked, and who owns it across every locale.",
          id: "OPipBev5tl",
          description: "Meta description for the localisation-operations use case",
        }),
      };
    case "localisation-quality-monitoring":
      return {
        title: intl.formatMessage({
          defaultMessage:
            "Translation Quality and Brand Guidelines on Every String | Hyperlocalise",
          id: "52wQDzLVaC",
          description: "Page title for the localisation-quality-monitoring use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Turn brand guides, glossaries, and market rules into checks that run on every translation. Catch issues before content syncs and track quality by locale.",
          id: "QYEQmqysKs",
          description: "Meta description for the localisation-quality-monitoring use case",
        }),
      };
    case "help-center-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Keep Every Help Article Current in Every Language | Hyperlocalise",
          id: "WzUY9jOFxo",
          description: "Page title for the help-center-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Detect help center changes, translate only what changed, review with support, and publish to every locale. A freshness view flags any language that falls behind.",
          id: "zqp1dSrBHD",
          description: "Meta description for the help-center-localisation use case",
        }),
      };
    case "market-entry":
      return {
        title: intl.formatMessage({
          defaultMessage: "Find the Markets Worth Entering, Then Win Them | Hyperlocalise",
          id: "5ZJHKpVRYJ",
          description: "Page title for the market-entry use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Research search demand, rankings, and AI visibility for up to 16 markets per domain, then create localised content that matches what each market searches for.",
          id: "rUKZkVCp2n",
          description: "Meta description for the market-entry use case",
        }),
      };
    case "marketing-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage:
            "Take Every Campaign Global Without Losing Your Brand Voice | Hyperlocalise",
          id: "QxszFRGx/f",
          description: "Page title for the marketing-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Turn one brief into copy, landing pages, emails, and creative for every market, with brand checks and local approvals built in, so every market launches together.",
          id: "GvWrNycq6V",
          description: "Meta description for the marketing-localisation use case",
        }),
      };
    case "market-experimentation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Test What Works in One Market, Then Roll It Out | Hyperlocalise",
          id: "lLZe+h/RmJ",
          description: "Page title for the market-experimentation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Show a different headline, price, or checkout to visitors in one country, see which version wins, and roll the winner out to the next market.",
          id: "eOByJiO4Fz",
          description: "Meta description for the market-experimentation use case",
        }),
      };
    case "github-release-localisation":
      return {
        title: intl.formatMessage({
          defaultMessage: "Localisation That Runs in Your Pull Requests | Hyperlocalise",
          id: "C4sPIehM0O",
          description: "Page title for the github-release-localisation use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Detect changed strings in each pull request, draft translations with context from the diff, and report locale status as a check before you merge.",
          id: "JIAFCyjrW8",
          description: "Meta description for the github-release-localisation use case",
        }),
      };
    case "localisation-cli-and-api":
      return {
        title: intl.formatMessage({
          defaultMessage: "Localisation CLI and API for Your Repo and CI | Hyperlocalise",
          id: "XxsXh1yNI7",
          description: "Page title for the localisation-cli-and-api use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Extract messages, push source files, and pull translations with one CLI and an i18n.yml file. Use the files and jobs API to build your own pipeline.",
          id: "HPGLdL7kcM",
          description: "Meta description for the localisation-cli-and-api use case",
        }),
      };
    case "localisation-for-ai-coding-agents":
      return {
        title: intl.formatMessage({
          defaultMessage: "Localise From Claude Code, Codex, and Cursor With MCP | Hyperlocalise",
          id: "Y0L75EEFpq",
          description: "Page title for the localisation-for-ai-coding-agents use case",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Connect your coding agent to Hyperlocalise over MCP to read projects and glossaries, start translation, and check status without leaving the editor.",
          id: "CAy9spW/4U",
          description: "Meta description for the localisation-for-ai-coding-agents use case",
        }),
      };
    default:
      return null;
  }
}
