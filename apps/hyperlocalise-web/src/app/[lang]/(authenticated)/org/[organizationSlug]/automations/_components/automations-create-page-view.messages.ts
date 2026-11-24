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
    defaultMessage: "Agent templates",
    id: "Qes9AxeWPG",
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
    defaultMessage: "Localisation workflows",
    id: "dMiZxsgrm/",
    description:
      "Heading of the section with ready-made workflow templates on the new automation page",
  },
  workflowTemplatesDescription: {
    defaultMessage:
      "The setups most teams start with. Each opens on the canvas with its steps connected; pick the project, the Slack channels and who does the work, then publish.",
    id: "Le+9bhU9g1",
    description: "Text under the heading of the workflow templates section",
  },
  workflowTemplateAiTranslateTitle: {
    defaultMessage: "AI translation on upload",
    id: "fBYBrbL0G6",
    description: "Title of the workflow template that translates each new source file with AI",
  },
  workflowTemplateAiTranslateDescription: {
    defaultMessage:
      "Translates each uploaded source file with AI, waits for it, runs QA on that file and posts the result to Slack.",
    id: "rfkzkk/MO+",
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
      "Translates each uploaded file with AI, then assigns a post-edit task per language, due in two days, that opens when the translation is done.",
    id: "aSP+9zPRje",
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
      "For each language of an uploaded file, assigns translate, edit and proofread tasks. Each opens when the one before it is done.",
    id: "sLaKcboN5o",
    description: "What the TEP workflow template does",
  },
  workflowTemplateReviewDoneTitle: {
    defaultMessage: "Review done: QA, then fix or deliver",
    id: "M5yyhs+NHe",
    description:
      "Title of the workflow template that runs QA when a post-edit or proofread task is finished",
  },
  workflowTemplateReviewDoneDescription: {
    defaultMessage:
      "When a post-edit or proofread task is done, runs QA on its work. Passing work is announced; failing work goes back to the same person to fix.",
    id: "gCwQoMqA0C",
    description: "What the review done workflow template does",
  },
  useTemplate: {
    defaultMessage: "Use this workflow",
    id: "U7BlJqdUmg",
    description: "Call to action on a featured localisation workflow card",
  },
  otherAutomationsTitle: {
    defaultMessage: "Other automations",
    id: "D6nGaFfAXq",
    description:
      "Heading above every other way to start an automation, after the featured localisation workflows",
  },
  otherAutomationsDescription: {
    defaultMessage:
      "Describe what you need, build an agent or a workflow from scratch, or start from an agent template.",
    id: "TxoIMy6Uz0",
    description: "Text under the Other automations heading",
  },
  stepUpload: {
    defaultMessage: "Upload",
    id: "2+VVMEY5/3",
    description: "Step in a featured workflow's flow: a source file is uploaded",
  },
  stepAiTranslate: {
    defaultMessage: "AI translate",
    id: "Hr/JQvzLiZ",
    description: "Step in a featured workflow's flow: the file is translated with AI",
  },
  stepTranslate: {
    defaultMessage: "Translate",
    id: "NEU7c1Ouub",
    description: "Step in a featured workflow's flow: a person translates",
  },
  stepPostEdit: {
    defaultMessage: "Post-edit",
    id: "TuCqNYsw9D",
    description: "Step in a featured workflow's flow: a person post-edits the AI translation",
  },
  stepEdit: {
    defaultMessage: "Edit",
    id: "Ouz6Q2dQze",
    description: "Step in a featured workflow's flow: a person edits the translation",
  },
  stepProofread: {
    defaultMessage: "Proofread",
    id: "CsN4Lwf+Xq",
    description: "Step in a featured workflow's flow: a person proofreads",
  },
  stepTaskDone: {
    defaultMessage: "Task done",
    id: "nvJIFxM8Ts",
    description: "Step in a featured workflow's flow: a review task is marked done",
  },
  stepQa: {
    defaultMessage: "QA",
    id: "jYP7V6VeVA",
    description: "Step in a featured workflow's flow: QA checks run",
  },
  stepFixOrShip: {
    defaultMessage: "Fix or ship",
    id: "Oo96L4uY2q",
    description: "Step in a featured workflow's flow: failing work goes back, passing work ships",
  },
  stepSlack: {
    defaultMessage: "Slack",
    id: "0Pk9BNF6+x",
    description: "Step in a featured workflow's flow: a Slack message is sent",
  },
});
