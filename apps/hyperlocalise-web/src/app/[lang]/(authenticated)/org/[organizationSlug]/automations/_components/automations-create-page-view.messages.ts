"use client";

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
import { defineMessages } from "react-intl";

export const automationsCreatePageViewMessages = defineMessages({
  pageTitle: {
    defaultMessage: "New automation",
    id: "3ZKOZGi/Qc",
    description: "Heading of the page where a new automation is started",
  },
  describeTitle: {
    defaultMessage: "What should happen?",
    id: "7DEQtGFLQ1",
    description: "Heading above the box where a person describes the automation they want",
  },
  describeDescription: {
    defaultMessage:
      "Describe it in your own words and the assistant sets it up. Nothing is saved until you create it.",
    id: "RK3LMOlZP5",
    description: "Text under the heading of the box where a person describes the automation",
  },
  buildTitle: {
    defaultMessage: "Or build it yourself",
    id: "4BZnk5LZmG",
    description: "Heading above the choice between an agent and a workflow, after the prompt box",
  },
  buildTitleAlone: {
    defaultMessage: "Build it yourself",
    id: "+4152IDY/y",
    description: "Heading above the choice between an agent and a workflow, without a prompt box",
  },
  agentTitle: {
    defaultMessage: "Agent",
    id: "OIHkvCAmyV",
    description: "Name of the kind of automation where an AI agent works out the steps",
  },
  agentDescription: {
    defaultMessage:
      "Tell it the goal in plain words. The agent works out the steps each time it runs.",
    id: "66nvTZUeaB",
    description: "What an agent automation is, on the card that starts one",
  },
  agentBestFor: {
    defaultMessage: "Best for reviews, translation, syncs and reports.",
    id: "2G8CF0pUmv",
    description: "What an agent automation suits, on the card that starts one",
  },
  recommended: {
    defaultMessage: "Recommended",
    id: "fS6BudEiI9",
    description: "Badge on the agent card: the kind of automation most people should start with",
  },
  workflowTitle: {
    defaultMessage: "Workflow",
    id: "ETjkOXJ/Xf",
    description: "Name of the kind of automation whose steps are drawn on a canvas",
  },
  workflowDescription: {
    defaultMessage: "Draw each step on a canvas, with branches, waits and approvals.",
    id: "3OnfnSk5HX",
    description: "What a workflow is, on the card that starts one",
  },
  workflowBestFor: {
    defaultMessage: "Best for fixed processes that must run the same way every time.",
    id: "G3dMj2jl8m",
    description: "What a workflow suits, on the card that starts one",
  },
  workflowCreating: {
    defaultMessage: "Opening the canvas…",
    id: "W2du8IaTWw",
    description: "Shown on the workflow card while a new workflow is being created",
  },
  workflowCreateFailed: {
    defaultMessage: "Could not create a workflow.",
    id: "7hw+ESYrhQ",
    description: "Toast when creating a new workflow from the new automation page fails",
  },
  workflowUpgrade: {
    defaultMessage: "Upgrade",
    id: "bDQcC/JF79",
    description: "Badge on the workflow card when the plan does not include workflows",
  },
  workflowUpgradeNote: {
    defaultMessage: "Workflows come with a higher plan.",
    id: "rM9rHeG5oE",
    description: "Note on the workflow card when the plan does not include workflows",
  },
  workflowRestrictedNote: {
    defaultMessage: "Ask a workspace admin to build a workflow.",
    id: "eyqY+L+ZXJ",
    description: "Note on the workflow card when the person's role cannot create workflows",
  },
  templatesTitle: {
    defaultMessage: "Start from a template",
    id: "hXWQPTAV5J",
    description: "Heading of the templates section on the new automation page",
  },
  templatesDescription: {
    defaultMessage: "Each template sets up an agent you can adjust before you save it.",
    id: "7zXzSUooIz",
    description: "Text under the heading of the templates section on the new automation page",
  },
  showAllTemplates: {
    defaultMessage: "Show all {count} templates",
    id: "YQE2bLfMR8",
    description: "Button that shows every template in the selected category",
  },
  showFewerTemplates: {
    defaultMessage: "Show fewer",
    id: "UByj1+dqaB",
    description: "Button that collapses the template grid back to the first few",
  },
  workflowTemplatesTitle: {
    defaultMessage: "Start a localisation workflow",
    id: "LooXSON0yB",
    description:
      "Heading of the section with ready-made workflow templates on the new automation page",
  },
  workflowTemplatesDescription: {
    defaultMessage:
      "Each one opens on the canvas with its steps connected. Choose the project and who does the work, add a Slack or email step where you want a message, then publish.",
    id: "mqcFT+iDFZ",
    description: "Text under the heading of the workflow templates section",
  },
  workflowTemplateAiTranslateTitle: {
    defaultMessage: "AI translation on upload",
    id: "fBYBrbL0G6",
    description: "Title of the workflow template that translates each new source file with AI",
  },
  workflowTemplateAiTranslateDescription: {
    defaultMessage:
      "Translates each new source file with AI, waits for it to finish, then runs QA checks.",
    id: "EfnDGW7eFH",
    description: "What the AI translation on upload workflow template does",
  },
  workflowTemplateMtpeTitle: {
    defaultMessage: "MTPE: AI translation, then post-edit",
    id: "SpbuxYK8Fb",
    description:
      "Title of the workflow template for machine translation followed by human post-editing (MTPE)",
  },
  workflowTemplateMtpeDescription: {
    defaultMessage:
      "Translates each new file with AI, then assigns a post-edit task per language that opens when the translation is done.",
    id: "/VHWku0EXG",
    description: "What the MTPE workflow template does",
  },
  workflowTemplateTepTitle: {
    defaultMessage: "TEP: translate, edit, proofread",
    id: "HEkzIiwa50",
    description:
      "Title of the workflow template for human translation, editing and proofreading (TEP)",
  },
  workflowTemplateTepDescription: {
    defaultMessage:
      "Assigns translate, edit and proofread tasks for each new file. Each task opens when the one before it is done.",
    id: "E0fFM34x6J",
    description: "What the TEP workflow template does",
  },
  workflowTemplateReviewDoneTitle: {
    defaultMessage: "Review done: run QA",
    id: "FRI2KkpAjS",
    description:
      "Title of the workflow template that runs QA when a post-edit or proofread task is finished",
  },
  workflowTemplateReviewDoneDescription: {
    defaultMessage:
      "When a post-edit or proofread task is marked done, runs QA checks on its project. Pair it with MTPE or TEP.",
    id: "Oitii+p+38",
    description: "What the review done workflow template does",
  },
});
