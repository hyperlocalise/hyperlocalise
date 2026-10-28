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
"use client";

import { defineMessages } from "react-intl";

export const aiUsageTabMessages = defineMessages({
  callsColumn: {
    id: "uCDllPtZvA",
    defaultMessage: "Runs",
    description: "Column heading: billed uses of AI",
  },
  inputColumn: {
    id: "2PDVG4rXQ7",
    defaultMessage: "Input tokens",
    description: "Column heading: tokens sent to the model",
  },
  outputColumn: {
    id: "1OvUY7tBML",
    defaultMessage: "Output tokens",
    description: "Column heading: tokens the model returned",
  },
  origin_translation: {
    id: "+LTWFvOwuo",
    defaultMessage: "Translation",
    description: "AI origin: translating content",
  },
  origin_review_and_qa: {
    id: "jfxaOQ3kwn",
    defaultMessage: "Review and QA",
    description: "AI origin: reviewing and checking translations",
  },
  origin_images_and_video: {
    id: "zGaGxn7T4v",
    defaultMessage: "Images and video",
    description: "AI origin: localising images and videos",
  },
  origin_assistants_and_chat: {
    id: "cY7ieh5gRY",
    defaultMessage: "Assistants and chat",
    description: "AI origin: chat and assistants",
  },
  origin_building_automations: {
    id: "4vVKnDID+V",
    defaultMessage: "Building automations",
    description: "AI origin: the assistant that builds automations",
  },
  origin_running_automations: {
    id: "2zoLhgI6WQ",
    defaultMessage: "Running automations",
    description: "AI origin: automations as they run",
  },
  origin_other: {
    id: "lYGZ/1ylRT",
    defaultMessage: "Other",
    description: "AI origin: anything else",
  },
  channel_app: {
    id: "IR5pE8HjYQ",
    defaultMessage: "App",
    description: "AI channel: the Hyperlocalise app",
  },
  channel_api: {
    id: "NUblgEq2S7",
    defaultMessage: "API",
    description: "AI channel: the public API",
  },
  channel_slack: {
    id: "UiXOndyUc4",
    defaultMessage: "Slack",
    description: "AI channel: Slack",
  },
  channel_email: {
    id: "smwYSK2Q3d",
    defaultMessage: "Email",
    description: "AI channel: email",
  },
  channel_web_chat: {
    id: "HhB3zV2KR/",
    defaultMessage: "Web chat",
    description: "AI channel: the public web chat",
  },
  channel_github: {
    id: "mX5rAoAEt+",
    defaultMessage: "GitHub",
    description: "AI channel: GitHub",
  },
  channel_gitlab: {
    id: "GgeiMXRkUs",
    defaultMessage: "GitLab",
    description: "AI channel: GitLab",
  },
  channel_contentful: {
    id: "Yvpi2I1ADA",
    defaultMessage: "Contentful",
    description: "AI channel: Contentful",
  },
  channel_connected_tms: {
    id: "SX3nxPtYJ2",
    defaultMessage: "Connected TMS",
    description: "AI channel: a connected translation management system",
  },
  channel_automation: {
    id: "CSGDCZep86",
    defaultMessage: "Automations",
    description: "AI channel: automations",
  },
  noAiUsage: {
    id: "LgOdyUATt4",
    defaultMessage: "No AI was used in these dates with these filters.",
    description: "Shown when there is no AI usage",
  },
  ai_dimension_area: {
    id: "9fW61ulwei",
    defaultMessage: "Area",
    description: "AI usage detail: where the AI was called, such as translation or chat",
  },
  ai_dimension_feature: {
    id: "34kYQgT6Zf",
    defaultMessage: "Feature",
    description: "AI usage detail: the part of the app that called the AI, finer than the area",
  },
  ai_dimension_model: {
    id: "KjDlDH4h/B",
    defaultMessage: "Model",
    description: "AI usage detail: the AI model",
  },
  ai_dimension_provider: {
    id: "P6qWY8Gy6F",
    defaultMessage: "Provider",
    description: "AI usage detail: the company behind the AI model",
  },
  ai_dimension_channel: {
    id: "xU90Ix6UXE",
    defaultMessage: "Channel",
    description: "AI usage detail: how the AI was reached, such as the app, the API or Slack",
  },
  ai_dimension_key: {
    id: "XjY9jRzAy/",
    defaultMessage: "Key",
    description:
      "AI usage detail: whether a call used Hyperlocalise AI or the workspace's own provider key",
  },
  ai_dimension_project: {
    id: "WGermyRKU2",
    defaultMessage: "Project",
    description: "AI usage detail: the project",
  },
  ai_dimension_task: {
    id: "+Fi3NEta4Y",
    defaultMessage: "Task",
    description: "AI usage detail: the task",
  },
  ai_dimension_automation: {
    id: "Vz+Pht0RPH",
    defaultMessage: "Automation",
    description: "AI usage detail: the automation that ran",
  },
  key_our_ai: {
    id: "ECeu9B3gSM",
    defaultMessage: "Hyperlocalise AI",
    description: "AI key type: calls through Hyperlocalise, which use plan credit",
  },
  key_own_key: {
    id: "0mxTGpKz7w",
    defaultMessage: "Your own key",
    description: "AI key type: calls on the workspace's own provider key, which use no plan credit",
  },
  key_not_recorded: {
    id: "JY6P7XiHyQ",
    defaultMessage: "Not recorded",
    description:
      "AI key type: billing did not record which key was used, as on rows from before it did",
  },
  groupBy: {
    id: "Zty8d4Y6Q8",
    defaultMessage: "Group by",
    description: "Label of the AI usage table's first grouping",
  },
  thenBy: {
    id: "u+flYkWbmL",
    defaultMessage: "Then by",
    description: "Label of the AI usage table's second grouping",
  },
  thenByNone: {
    id: "ZzV0hKLWlE",
    defaultMessage: "Nothing",
    description: "Second grouping option: no second grouping",
  },
  chartMeasure: {
    id: "Ph0FvVI41z",
    defaultMessage: "Chart shows",
    description: "Accessible name of the switch for what the AI usage chart measures",
  },
  measure_tokens: {
    id: "/wIWjD2LD2",
    defaultMessage: "Tokens",
    description:
      "AI usage chart option: every token billing counted, input, output, cached and reasoning",
  },
  measure_calls: {
    id: "DH4SBHdjfp",
    defaultMessage: "Runs",
    description: "AI usage chart option: billed uses of AI",
  },
  measure_charge: {
    id: "aVfxD0nSAA",
    defaultMessage: "AI credit",
    description: "AI usage chart option: plan AI credit used",
  },
  chartPerDay: {
    id: "xDMUZiSwLO",
    defaultMessage: "AI usage per day",
    description: "Title of the AI usage chart, day by day",
  },
  chartPerWeek: {
    id: "AYzHzw5eZq",
    defaultMessage: "AI usage per week",
    description: "Title of the AI usage chart, week by week",
  },
  chartDetail: {
    id: "S/om+96e8o",
    defaultMessage: "Grouped by {dimension}, largest first, past the fifth as Other. Days are UTC.",
    description:
      "Subtitle of the AI usage chart; dimension is the name of a detail, such as Area or Model",
  },
  chartSummary: {
    id: "slXSkb5/Gg",
    defaultMessage: "{measure} from {from} to {to}: {total}",
    description: "Accessible summary of the AI usage chart",
  },
  otherGroup: {
    id: "IauUy2whYL",
    defaultMessage: "Other",
    description: "Chart series: every group outside the largest five",
  },
  noneGroup: {
    id: "1gkCz7B8Qb",
    defaultMessage: "None",
    description: "AI usage group for calls without that detail, such as no task or no model",
  },
  outsideProjects: {
    id: "B6JWhVWhYA",
    defaultMessage: "Outside any project",
    description: "AI usage group: calls tied to no project, such as chat",
  },
  noTask: {
    id: "wCUR6X8Z7Z",
    defaultMessage: "No task",
    description: "AI usage group: calls on no task",
  },
  noAutomation: {
    id: "CTzO+JUWTM",
    defaultMessage: "No automation",
    description: "AI usage group: calls made by no automation",
  },
  tableTitle: {
    id: "pXVDdwBd+I",
    defaultMessage: "Breakdown",
    description: "Title of the AI usage table",
  },
  tableDetail: {
    id: "DK4GxTemCY",
    defaultMessage: "Choose a row to narrow the tab to it.",
    description: "Subtitle of the AI usage table",
  },
  narrowTo: {
    id: "lV1uls2wmK",
    defaultMessage: "Show only {name}",
    description: "Accessible name of a button that narrows AI usage to one row",
  },
  imagesColumn: {
    id: "qTqRADscBS",
    defaultMessage: "Images",
    description: "Column heading: images made with AI",
  },
  videosColumn: {
    id: "GmgO3Kp7gv",
    defaultMessage: "Videos",
    description: "Column heading: videos made with AI",
  },
  chargeColumn: {
    id: "lIOUrpz16b",
    defaultMessage: "AI credit",
    description: "Column heading: plan AI credit billing recorded",
  },
  calls: {
    id: "yQ7tyKyCdt",
    defaultMessage: "AI runs",
    description:
      "AI usage card: billed uses of AI, each a task, automation run, chat turn or single request",
  },
  images: {
    id: "0j4Nbqpy8B",
    defaultMessage: "Images made",
    description: "AI usage card: images made with AI",
  },
  videos: {
    id: "vhU0viUlLj",
    defaultMessage: "Videos made",
    description: "AI usage card: videos made with AI",
  },
  charge: {
    id: "JOb5Bubrx0",
    defaultMessage: "AI credit used",
    description: "AI usage card: plan AI credit billing recorded for the AI used",
  },
  chargeDetail: {
    id: "+zda51bOsT",
    defaultMessage: "As billing recorded it, for AI through Hyperlocalise",
    description: "Detail under the AI credit used card",
  },
  ownKeyCharge: {
    id: "SOILzo2Mm+",
    defaultMessage: "Own key",
    description:
      "Charge cell for calls that all used the workspace's own provider key, which costs no plan credit",
  },
  belowOneCent: {
    id: "VRF9pR5hpD",
    defaultMessage: "Under {amount}",
    description:
      "Charge shown for an amount above zero but below one cent; amount is one cent, as money",
  },
  notRecorded: {
    id: "dRAnpDEjDR",
    defaultMessage: "Not recorded",
    description: "Charge cell when billing has recorded no charge for the calls",
  },
  someNotRecorded: {
    id: "Jq8P8koF7y",
    defaultMessage: "{count, plural, one {# not recorded} other {# not recorded}}",
    description:
      "Under an AI credit amount: how many runs, images or videos have no credit recorded by billing",
  },
  unrecordedNote: {
    id: "5zGLoyn2ds",
    defaultMessage:
      "{count, plural, one {# run, image or video has no AI credit recorded by billing, so AI credit used leaves it out.} other {# runs, images or videos have no AI credit recorded by billing, so AI credit used leaves them out.}}",
    description: "Note under the AI usage cards",
  },
  ownKeyNote: {
    id: "SI78vK8CbA",
    defaultMessage:
      "{count, plural, one {# run, image or video used your own provider key, which uses no plan credit.} other {# runs, images or videos used your own provider key, which uses no plan credit.}}",
    description: "Note under the AI usage cards",
  },
  planCreditLink: {
    id: "NI3llQMoXS",
    defaultMessage: "Plan credit and allowance",
    description: "Link from AI usage to the billing page's plan usage",
  },
  narrowedTo: {
    id: "xuKFsgkvM/",
    defaultMessage: "{dimension}: {value}",
    description: "A filter chip on AI usage: the detail and its chosen value",
  },
  removeFilter: {
    id: "QvlJLJrsTw",
    defaultMessage: "Remove filter: {dimension}",
    description:
      "Accessible name of the button that removes an AI usage filter; dimension is the name of a detail, such as Model",
  },
  allValues: {
    id: "v6mNRf846Z",
    defaultMessage: "All",
    description: "Filter option: no filter on this detail",
  },
  feature_translation_job_create: {
    id: "AR3GmLE5U8",
    defaultMessage: "Translation tasks",
    description: "AI feature: a task translating content",
  },
  feature_email_translation_job_create: {
    id: "0l5RN3KDrD",
    defaultMessage: "Translation tasks from email",
    description: "AI feature: a task made from an emailed file",
  },
  feature_contentful_agent: {
    id: "Mod2wvXZ5N",
    defaultMessage: "Contentful entry translation",
    description: "AI feature: translating a Contentful entry",
  },
  feature_contentful_field_translation: {
    id: "SkgM3ZpSJX",
    defaultMessage: "Contentful field translation",
    description: "AI feature: translating Contentful fields in a Contentful run",
  },
  feature_content_editor_ai_suggestion: {
    id: "M2DEz7qDBI",
    defaultMessage: "Editor suggestions",
    description: "AI feature: AI suggestions in the content editor",
  },
  feature_content_editor_document_regenerate: {
    id: "5uG1s/Tj9f",
    defaultMessage: "Document regenerating",
    description: "AI feature: regenerating a translated document",
  },
  feature_chat_agent_turn: {
    id: "wPhKfd2oCa",
    defaultMessage: "Chat assistant",
    description: "AI feature: the in-app chat assistant",
  },
  feature_chat_translate_string: {
    id: "PVV5kzeiKe",
    defaultMessage: "Chat string translation",
    description: "AI feature: strings the chat assistants translate",
  },
  feature_web_chat_agent_turn: {
    id: "WJxIf/08vm",
    defaultMessage: "Web chat",
    description: "AI feature: the public web chat",
  },
  feature_slack_agent_turn: {
    id: "QfEwz9eSDW",
    defaultMessage: "Slack assistant",
    description: "AI feature: the assistant in Slack",
  },
  feature_project_file_string_context_lookup: {
    id: "m+nKGIs3Va",
    defaultMessage: "String context lookup",
    description: "AI feature: looking up a string's context in a repository",
  },
  feature_repository_agent_workflow: {
    id: "ultNeGfvXw",
    defaultMessage: "GitHub requests",
    description:
      "AI feature: answering a person's mention of Hyperlocalise in a GitHub pull request",
  },
  feature_automation_assistant_turn: {
    id: "D1c26aJFHC",
    defaultMessage: "Automation assistant",
    description: "AI feature: the assistant that helps build automations",
  },
  feature_visual_workflow_ai_step: {
    id: "axWhEFeMZL",
    defaultMessage: "Visual workflow AI step",
    description: "AI feature: the AI step of a visual workflow",
  },
  feature_github_repository_commit_review: {
    id: "FpRpzYXL81",
    defaultMessage: "GitHub commit reviews",
    description: "AI feature: automatic localisation reviews of GitHub commits",
  },
  feature_github_pull_request_review: {
    id: "n6TXU+n3nd",
    defaultMessage: "GitHub pull request reviews",
    description: "AI feature: automatic localisation reviews of GitHub pull requests",
  },
  feature_image_text_extraction: {
    id: "BuGzwjOJQ6",
    defaultMessage: "Reading text in images",
    description: "AI feature: reading the text in an image or a video frame",
  },
  feature_agent_run_create: {
    id: "hI8KYvfk45",
    defaultMessage: "Connected TMS tasks",
    description: "AI feature: AI runs on tasks from a connected translation management system",
  },
  feature_workspace_orchestrator: {
    id: "s0B+f3G8Yz",
    defaultMessage: "Automation runs",
    description: "AI feature: the main loop of an automation run",
  },
  feature_workspace_github_repository_agent: {
    id: "Nfx6HTcwHn",
    defaultMessage: "Automation GitHub steps",
    description: "AI feature: an automation's GitHub step",
  },
  feature_workspace_gitlab_repository_agent: {
    id: "LnL0pDC7fH",
    defaultMessage: "Automation GitLab steps",
    description: "AI feature: an automation's GitLab step",
  },
  feature_workspace_crowdin_agent: {
    id: "Qy4JOmQ7Ba",
    defaultMessage: "Automation Crowdin steps",
    description: "AI feature: an automation's Crowdin step",
  },
  feature_workspace_crowdin_review_suggestion: {
    id: "gyDBGtZej3",
    defaultMessage: "Automation Crowdin suggestions",
    description: "AI feature: suggestions an automation makes for Crowdin strings",
  },
  feature_workspace_web_search_agent: {
    id: "dIV5pErGts",
    defaultMessage: "Automation web searches",
    description: "AI feature: an automation's web search step",
  },
  feature_workspace_ahrefs_agent: {
    id: "xTS+QGWoW0",
    defaultMessage: "Automation Ahrefs steps",
    description: "AI feature: an automation's Ahrefs step",
  },
  feature_workspace_semrush_agent: {
    id: "6I1vrUL/ho",
    defaultMessage: "Automation Semrush steps",
    description: "AI feature: an automation's Semrush step",
  },
  feature_workspace_zernio_agent: {
    id: "j3rHI5kUuX",
    defaultMessage: "Automation Zernio steps",
    description: "AI feature: an automation's Zernio step",
  },
  feature_project_image_variant: {
    id: "AZ/EUzNS2q",
    defaultMessage: "Image translations",
    description: "AI feature: translated versions of a project's images",
  },
  feature_project_image_url_translation: {
    id: "MrMT7zpFGE",
    defaultMessage: "Images from links",
    description: "AI feature: images found at a link in a string",
  },
  feature_slack_image_localization: {
    id: "pp9GGJhzXL",
    defaultMessage: "Slack images",
    description: "AI feature: images sent in Slack",
  },
  feature_email_image_localization: {
    id: "iSkR3k2Z83",
    defaultMessage: "Emailed images",
    description: "AI feature: images sent by email",
  },
  feature_contentful_image_localization: {
    id: "Bi1sMbiLMN",
    defaultMessage: "Contentful images",
    description: "AI feature: Contentful image assets",
  },
  feature_project_video_variant: {
    id: "G6Gi/jdmf1",
    defaultMessage: "Video translations",
    description: "AI feature: translated versions of a project's videos",
  },
  feature_project_video_url_translation: {
    id: "oRDtAL/tPw",
    defaultMessage: "Videos from links",
    description: "AI feature: videos found at a link in a string",
  },
  featureUnknown: {
    id: "uq9xFpQ4IJ",
    defaultMessage: "{area} ({name})",
    description: "AI feature without a plain name: its area, then the name billing records",
  },
  callsDetail: {
    id: "yAZ3Vc7BoF",
    defaultMessage: "Each a task, automation run, chat turn or single request that used AI",
    description: "Detail under the AI runs card",
  },
  tokens: {
    id: "78hTefWIZ0",
    defaultMessage: "Tokens",
    description: "AI usage card: every token billing counted, input, output, cached and reasoning",
  },
  tokensDetail: {
    id: "+92OE+qwxB",
    defaultMessage: "{input} input · {output} output · {other} cache and reasoning",
    description: "Detail under the tokens card: the token counts, already formatted",
  },
  cacheAndReasoningColumn: {
    id: "C9xyZ9SY4i",
    defaultMessage: "Cache and reasoning",
    description: "Column heading: cached input tokens and reasoning tokens billing counted",
  },
  narrowToUnder: {
    id: "UFniVaKlF7",
    defaultMessage: "Show only {name} under {group}",
    description: "Accessible name of a button that narrows AI usage to a row within a group",
  },
  underGroup: {
    id: "FRI1iIuOU/",
    defaultMessage: "{group}:",
    description: "Read before a row within a group, for screen readers; group is the group's name",
  },
});
