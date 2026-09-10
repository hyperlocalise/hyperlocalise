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

export const hyperlabMessages = defineMessages({
  workspaceLabel: {
    defaultMessage: "Workspace",
    id: "vttVPlqAsl",
    description: "Page label above Hyperlab titles",
  },
  overviewTitle: {
    defaultMessage: "Hyperlab",
    id: "F9TKZ7VAEV",
    description: "Hyperlab overview page title",
  },
  overviewDescription: {
    defaultMessage:
      "Try a different headline, checkout, or offer in one market. Keep the version people like.",
    id: "M7Q//ePO1O",
    description: "Hyperlab overview page description",
  },
  navHome: {
    defaultMessage: "Home",
    id: "lrOpO6sjSs",
    description: "Hyperlab sub-navigation item for the home page",
  },
  navFlags: {
    defaultMessage: "Flags",
    id: "IpQ4vzh2L9",
    description: "Hyperlab sub-navigation item for flags",
  },
  navExperiments: {
    defaultMessage: "Experiments",
    id: "A6hxrVxwgZ",
    description: "Hyperlab sub-navigation item for experiments",
  },
  navAudiences: {
    defaultMessage: "Audiences",
    id: "ZJI5SD947D",
    description: "Hyperlab sub-navigation item for audiences",
  },
  navKeys: {
    defaultMessage: "API keys",
    id: "AyY17qkMp3",
    description: "Hyperlab sub-navigation item for API keys",
  },
  backToList: {
    defaultMessage: "Back",
    id: "VO5BaUGRxq",
    description: "Back link from a Hyperlab detail page",
  },
  retry: {
    defaultMessage: "Try again",
    id: "96aLwrrFye",
    description: "Retry button after a Hyperlab load error",
  },
  view: {
    defaultMessage: "Open",
    id: "KRf115Q8cE",
    description: "Primary row action to open a Hyperlab resource",
  },
  openHomeCard: {
    defaultMessage: "Open",
    id: "QHAFy1/kgR",
    description: "Link on a Hyperlab home shortcut card",
  },
  homeExperimentsTitle: {
    defaultMessage: "Experiments",
    id: "OiGEycK9rN",
    description: "Home card title for experiments",
  },
  homeExperimentsBody: {
    defaultMessage:
      "A timed test with a start date, an audience, and the versions you want to try.",
    id: "3IEozwJgIw",
    description: "Home card body for experiments",
  },
  homeAudiencesTitle: {
    defaultMessage: "Audiences",
    id: "OfDa4wGZDF",
    description: "Home card title for audiences",
  },
  homeAudiencesBody: {
    defaultMessage: "Who should see the test. Japan only, paid plans, or a traffic source.",
    id: "4wkRisAVBi",
    description: "Home card body for audiences",
  },
  homeFlagsTitle: {
    defaultMessage: "Flags",
    id: "FF3k34MI6V",
    description: "Home card title for flags",
  },
  homeFlagsBody: {
    defaultMessage: "The site change itself: a new button, headline, or checkout.",
    id: "OPyNBfu01q",
    description: "Home card body for flags",
  },
  homeConnectionTitle: {
    defaultMessage: "API keys",
    id: "7XNTVZL8/b",
    description: "Home card title for API keys",
  },
  homeConnectionBody: {
    defaultMessage: "Create a key and send it to whoever plugs Hyperlab into your website.",
    id: "AVpQwXJaXX",
    description: "Home card body for API keys",
  },
  homeCount: {
    defaultMessage: "{count, plural, one {# set up} other {# set up}}",
    id: "xDu/Ojv5YK",
    description: "Count of resources on a Hyperlab home card",
  },
  homeEmptyCount: {
    defaultMessage: "None yet",
    id: "z9I05YOvbx",
    description: "Empty count on a Hyperlab home card",
  },
  howItWorksTitle: {
    defaultMessage: "How a test usually goes",
    id: "UhcD2CtYRf",
    description: "Heading for the Hyperlab home how-it-works steps",
  },
  howItWorksStep1: {
    defaultMessage: "Start an experiment with a name and the dates it should run.",
    id: "HelC/O82bk",
    description: "Hyperlab home how-it-works step 1",
  },
  howItWorksStep2: {
    defaultMessage: "Choose who should see it, like visitors in Japan.",
    id: "Dww+L5RpJy",
    description: "Hyperlab home how-it-works step 2",
  },
  howItWorksStep3: {
    defaultMessage: "Add the versions and the site changes each one should turn on.",
    id: "f3sl/ZbsET",
    description: "Hyperlab home how-it-works step 3",
  },
  howItWorksStep4: {
    defaultMessage: "Turn it on. Keep the version that works.",
    id: "qFvm5jLVh9",
    description: "Hyperlab home how-it-works step 4",
  },
  developerDetailsTitle: {
    defaultMessage: "For your developer",
    id: "eqSC7QtAFi",
    description: "Collapsible heading for developer setup on Hyperlab home",
  },
  ofrepTitle: {
    defaultMessage: "Website endpoint",
    id: "h01zk4uF/7",
    description: "Heading for the evaluate URL on the Hyperlab home page",
  },
  ofrepHint: {
    defaultMessage:
      "Your developer points the site here and sends the API key. You do not need this for day-to-day work.",
    id: "cfpM3B2xlp",
    description: "Hint for how to use the evaluate URL",
  },
  snippetTitle: {
    defaultMessage: "Example setup",
    id: "q0VCKEK9WI",
    description: "Heading for the developer snippet on Hyperlab home",
  },
  copyUrl: {
    defaultMessage: "Copy",
    id: "gRhG9VDHId",
    description: "Copy button for the Hyperlab endpoint URL",
  },
  copied: {
    defaultMessage: "Copied",
    id: "yJXWaRawBn",
    description: "Confirmation after copying a Hyperlab value",
  },
  flagsTitle: {
    defaultMessage: "Flags",
    id: "mnIDIyLJHl",
    description: "Flags list page title",
  },
  flagsDescription: {
    defaultMessage:
      "Each flag is a site change you can turn on in a test, or keep on for everyone.",
    id: "uYxFyU7KUw",
    description: "Flags list page description",
  },
  flagsEmptyTitle: {
    defaultMessage: "No flags yet",
    id: "eSoP3VgfaM",
    description: "Empty state title for the flags list",
  },
  flagsEmpty: {
    defaultMessage: "Create a flag for the headline, button, or checkout you want to try.",
    id: "vMMtDCVF4r",
    description: "Empty state for the flags list",
  },
  createFlag: {
    defaultMessage: "New flag",
    id: "f4o99PocbD",
    description: "Primary action to create a flag",
  },
  createFlagTitle: {
    defaultMessage: "New flag",
    id: "Zr6ABmqsLb",
    description: "Dialog title for creating a flag",
  },
  createFlagDescription: {
    defaultMessage: "Give it a short name your site can look up. You can add a note after.",
    id: "7AaTo1l2gW",
    description: "Dialog description for creating a flag",
  },
  flagKeyLabel: {
    defaultMessage: "Name on the site",
    id: "Rg6nvXN/ax",
    description: "Label for a flag key field",
  },
  flagKeyHint: {
    defaultMessage: "Lowercase, like japan-checkout-cta. Your developer uses this name.",
    id: "5BOsFF/PTB",
    description: "Hint under the flag key field",
  },
  flagKindLabel: {
    defaultMessage: "How you will use it",
    id: "AfQNtHreD6",
    description: "Label for a flag kind field",
  },
  flagDescriptionLabel: {
    defaultMessage: "Note",
    id: "v2DBFLNBst",
    description: "Label for a flag description field",
  },
  flagKindExperiment: {
    defaultMessage: "Used in a test",
    id: "wbZzuI7+7/",
    description: "Flag kind option for experiment flags",
  },
  flagKindConfig: {
    defaultMessage: "Always-on setting",
    id: "Lv2+QrpmOq",
    description: "Flag kind option for config flags",
  },
  flagKindHint: {
    defaultMessage:
      "Use a test flag when you want to try versions. Use an always-on setting for a value the site should always read.",
    id: "LJMSAlSEpI",
    description: "Hint explaining flag kinds",
  },
  flagColumnName: {
    defaultMessage: "Name",
    id: "NplBzrBWM2",
    description: "Flags table column for the flag key",
  },
  flagColumnKind: {
    defaultMessage: "Type",
    id: "NcLDNmoL2r",
    description: "Flags table column for flag kind",
  },
  flagColumnNote: {
    defaultMessage: "Note",
    id: "J1Vxfqf4RG",
    description: "Flags table column for flag description",
  },
  flagColumnUpdated: {
    defaultMessage: "Updated",
    id: "FrlMkt20b4",
    description: "Flags table column for updated date",
  },
  save: {
    defaultMessage: "Save",
    id: "cAVXvKrNnE",
    description: "Generic save button",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "twYkbdGYuC",
    description: "Pending label while a Hyperlab save is in progress",
  },
  creating: {
    defaultMessage: "Creating…",
    id: "FAXvnzJ8Wm",
    description: "Pending label while a Hyperlab create is in progress",
  },
  unsavedChanges: {
    defaultMessage: "Unsaved changes",
    id: "C1osco57de",
    description: "Hint that a Hyperlab form has unsaved edits",
  },
  delete: {
    defaultMessage: "Delete",
    id: "UaufkeyA3n",
    description: "Generic delete button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "xyn8zLrmnV",
    description: "Cancel button in Hyperlab dialogs",
  },
  loadError: {
    defaultMessage: "We could not load this page. Try again.",
    id: "Y/N3J2JfQ8",
    description: "Generic load error for Hyperlab pages",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "awOa5dMYx4",
    description: "Loading state for Hyperlab pages",
  },
  saveSuccess: {
    defaultMessage: "Saved",
    id: "Bf9K7N84st",
    description: "Toast after a successful Hyperlab save",
  },
  createSuccess: {
    defaultMessage: "Created",
    id: "wGEGHcQdgU",
    description: "Toast after a successful Hyperlab create",
  },
  deleteSuccess: {
    defaultMessage: "Deleted",
    id: "kh+2+qzfr2",
    description: "Toast after a successful Hyperlab delete",
  },
  statusUpdated: {
    defaultMessage: "Status set to {status}",
    id: "3AZyKoWt8Y",
    description: "Toast after changing experiment status",
  },
  experimentsTitle: {
    defaultMessage: "Experiments",
    id: "eJvMGD1rKZ",
    description: "Experiments list page title",
  },
  experimentsDescription: {
    defaultMessage:
      "A test with dates, who sees it, and the versions of your site you want to compare.",
    id: "vhIR6HNBrL",
    description: "Experiments list page description",
  },
  experimentsEmptyTitle: {
    defaultMessage: "No experiments yet",
    id: "S8IeRUW8pF",
    description: "Empty state title for the experiments list",
  },
  experimentsEmpty: {
    defaultMessage: "Create a test, pick who sees it, then turn it on when you are ready.",
    id: "ewtw4dTf/D",
    description: "Empty state for the experiments list",
  },
  createExperiment: {
    defaultMessage: "New experiment",
    id: "GSXicc8Q67",
    description: "Primary action to create an experiment",
  },
  createExperimentTitle: {
    defaultMessage: "New experiment",
    id: "sd0MzVsa4K",
    description: "Dialog title for creating an experiment",
  },
  createExperimentDescription: {
    defaultMessage: "Name it, pick a type, and set when it should run.",
    id: "pnu3HTxKQF",
    description: "Dialog description for creating an experiment",
  },
  experimentNameLabel: {
    defaultMessage: "Name",
    id: "it78JkINXy",
    description: "Label for an experiment name field",
  },
  experimentNamePlaceholder: {
    defaultMessage: "Japan checkout headline",
    id: "ukoQ3XzJ1o",
    description: "Placeholder for an experiment name field",
  },
  experimentKindLabel: {
    defaultMessage: "Type",
    id: "1MvosGjawR",
    description: "Label for an experiment type field",
  },
  experimentKindToggle: {
    defaultMessage: "On or off",
    id: "5x5hr7hrs6",
    description: "Experiment type option for a single-variant toggle",
  },
  experimentKindToggleHint: {
    defaultMessage: "Show a change to some visitors. Everyone else stays on the current site.",
    id: "pdCULvOJkP",
    description: "Hint for the on-or-off experiment type",
  },
  experimentKindAb: {
    defaultMessage: "A/B test",
    id: "tJedwqsl7m",
    description: "Experiment type option for an A/B test",
  },
  experimentKindAbHint: {
    defaultMessage: "Show two or more versions and keep the one that works.",
    id: "fu8eVhN1Ej",
    description: "Hint for the A/B experiment type",
  },
  experimentStatusLabel: {
    defaultMessage: "Status",
    id: "wk3PSCT0hz",
    description: "Label for experiment status",
  },
  statusDraft: {
    defaultMessage: "Draft",
    id: "he5Mu8XAgG",
    description: "Experiment status draft",
  },
  statusActive: {
    defaultMessage: "On",
    id: "pqlWRAaR3+",
    description: "Experiment status active",
  },
  statusArchived: {
    defaultMessage: "Archived",
    id: "m9qaahMbE0",
    description: "Experiment status archived",
  },
  statusExpired: {
    defaultMessage: "Ended",
    id: "HFwB2VloGv",
    description: "Badge when an experiment end date has passed",
  },
  activate: {
    defaultMessage: "Turn on",
    id: "DLAlfojpxi",
    description: "Button to activate an experiment",
  },
  archive: {
    defaultMessage: "Archive",
    id: "fYLfw9YZEc",
    description: "Button to archive an experiment",
  },
  startDateLabel: {
    defaultMessage: "Start date",
    id: "9cLs6xInYn",
    description: "Label for experiment start date",
  },
  startTimeLabel: {
    defaultMessage: "Start time",
    id: "/rt02FtsLl",
    description: "Label for experiment start time",
  },
  endDateLabel: {
    defaultMessage: "End date",
    id: "iRA8eH3NfJ",
    description: "Label for experiment end date",
  },
  endTimeLabel: {
    defaultMessage: "End time",
    id: "hm9/43e7py",
    description: "Label for experiment end time",
  },
  timezoneLabel: {
    defaultMessage: "Timezone",
    id: "g+dqlGrXPT",
    description: "Label for experiment timezone",
  },
  scheduleColumn: {
    defaultMessage: "When it runs",
    id: "1XNL0pGEyo",
    description: "Experiments table column for the schedule",
  },
  detailsCardTitle: {
    defaultMessage: "Name and schedule",
    id: "mnbqOj7NGl",
    description: "Heading for experiment details card",
  },
  rolloutCardTitle: {
    defaultMessage: "Who sees it, and how many",
    id: "Ja/m0N2Vv1",
    description: "Heading for experiment rollout card",
  },
  rolloutLabel: {
    defaultMessage: "Share of visitors",
    id: "aSYebYY/zD",
    description: "Label for rollout percentage",
  },
  rolloutHint: {
    defaultMessage: "100% means everyone in the audience can enter the test.",
    id: "g/VG7uvDiS",
    description: "Hint for experiment rollout percentage",
  },
  saveRollout: {
    defaultMessage: "Save who sees it",
    id: "D18krkXJyI",
    description: "Button to save experiment rollout settings",
  },
  variantsTitle: {
    defaultMessage: "Versions",
    id: "rUU/UrqSO1",
    description: "Heading for the variants list on an experiment",
  },
  addVariant: {
    defaultMessage: "Add version",
    id: "VmjbraVYlA",
    description: "Button to add a variant to an experiment",
  },
  addVariantTitle: {
    defaultMessage: "Add a version",
    id: "doxAnr+fKa",
    description: "Dialog title for adding a variant",
  },
  addVariantDescription: {
    defaultMessage: "Give this version a short name, then attach the site changes it should show.",
    id: "gKJKlsBj8H",
    description: "Dialog description for adding a variant",
  },
  variantKeyLabel: {
    defaultMessage: "Version name",
    id: "NC5w4Oo8H0",
    description: "Label for a variant key field",
  },
  variantKeyPlaceholder: {
    defaultMessage: "new-headline",
    id: "RJqS5CWiIH",
    description: "Placeholder for a variant key field",
  },
  variantRolloutHint: {
    defaultMessage: "Split the test across versions. 50% and 50% is an even A/B test.",
    id: "LOU5j50nOa",
    description: "Hint explaining how variant rollout percentages allocate traffic",
  },
  saveVariant: {
    defaultMessage: "Save split",
    id: "p3FC9aFD6g",
    description: "Button to save a variant rollout percentage",
  },
  saveVariantSplits: {
    defaultMessage: "Save version split",
    id: "iEVziBnq7E",
    description: "Button to save all variant rollout percentages",
  },
  variantSplitTitle: {
    defaultMessage: "How traffic is split",
    id: "0Qyp17nVuR",
    description: "Heading for variant rollout percentages",
  },
  variantSplitTotal: {
    defaultMessage: "Total {value}%",
    id: "k00+FztnOC",
    description: "Total of variant rollout percentages",
  },
  variantSplitWarning: {
    defaultMessage: "These shares should add up to 100%.",
    id: "+g4oD8eEBW",
    description: "Warning when variant rollouts do not sum to 100 percent",
  },
  control: {
    defaultMessage: "Original",
    id: "Lvl0VQRg+D",
    description: "Badge for the control variant",
  },
  allocation: {
    defaultMessage: "{percent}% of the test",
    id: "OBw52VUo2G",
    description: "Allocation label for a variant",
  },
  noVariants: {
    defaultMessage: "Add at least one version, then attach the site changes it should show.",
    id: "r0tLUePFNr",
    description: "Empty state inside an experiment with no variants",
  },
  variantFlagsTitle: {
    defaultMessage: "Flags on this version",
    id: "y4P+Jle8Ha",
    description: "Heading for flags attached to a variant",
  },
  noVariantFlags: {
    defaultMessage: "No flags on this version yet.",
    id: "cQdPGrDG2x",
    description: "Empty state when a variant has no flag assignments",
  },
  attachFlag: {
    defaultMessage: "Add flag",
    id: "V1dLMymLq0",
    description: "Button to attach a flag to a variant",
  },
  attachFlagTitle: {
    defaultMessage: "Add a flag to {variant}",
    id: "anf74PXJim",
    description: "Sheet title for attaching a flag to a variant",
  },
  attachFlagDescription: {
    defaultMessage: "Pick an existing flag or create a new one for this version.",
    id: "VI5Y2iTsYG",
    description: "Sheet description for attaching a flag to a variant",
  },
  existingFlagTab: {
    defaultMessage: "Existing flag",
    id: "6bCLEYenE4",
    description: "Tab to pick an existing flag",
  },
  newFlagTab: {
    defaultMessage: "New flag",
    id: "boAE79e4n0",
    description: "Tab to create a flag while attaching",
  },
  pickFlagLabel: {
    defaultMessage: "Flag",
    id: "8djDI68UMm",
    description: "Label for selecting an existing flag",
  },
  noFlagsToAttach: {
    defaultMessage: "Create a flag first, then add it here.",
    id: "tsDqk9P5Ui",
    description: "Empty state when attaching a flag but none exist",
  },
  removeFlag: {
    defaultMessage: "Remove",
    id: "seDSW3Uw4G",
    description: "Button to remove a flag from a variant",
  },
  deleteVariant: {
    defaultMessage: "Remove version",
    id: "pT3N2TGbMH",
    description: "Button to delete a variant",
  },
  deleteVariantConfirmTitle: {
    defaultMessage: "Remove this version?",
    id: "WiMazzkPhc",
    description: "Confirm dialog title for deleting a variant",
  },
  deleteVariantConfirmBody: {
    defaultMessage: "“{name}” will be removed from this experiment. This cannot be undone.",
    id: "KePBZ202q8",
    description: "Confirm dialog body for deleting a variant",
  },
  cannotDeleteOnlyVariant: {
    defaultMessage: "Add another version before removing this one.",
    id: "gtDWnIbfL2",
    description: "Error when deleting the last variant",
  },
  deleteExperimentTitle: {
    defaultMessage: "Delete this experiment?",
    id: "TBVtdvWNHo",
    description: "Confirm dialog title for deleting an experiment",
  },
  deleteExperimentBody: {
    defaultMessage: "“{name}” and its versions will be deleted. This cannot be undone.",
    id: "bI+YTOZIIO",
    description: "Confirm dialog body for deleting an experiment",
  },
  deleteExperiment: {
    defaultMessage: "Delete experiment",
    id: "1qmea9tlQm",
    description: "Confirm button to delete an experiment",
  },
  audiencesTitle: {
    defaultMessage: "Audiences",
    id: "HqRsGE2RWy",
    description: "Audiences list page title",
  },
  audiencesDescription: {
    defaultMessage:
      "Groups of visitors who should see a test, like people in Japan or on a paid plan.",
    id: "sdjKjNa1CS",
    description: "Audiences list page description",
  },
  audiencesEmptyTitle: {
    defaultMessage: "No audiences yet",
    id: "JL3JSNfNKu",
    description: "Empty state title for the audiences list",
  },
  audiencesEmpty: {
    defaultMessage: "Create a group, then reuse it on any experiment.",
    id: "ti9NrEzw0g",
    description: "Empty state for the audiences list",
  },
  createAudience: {
    defaultMessage: "New audience",
    id: "gwnHlCz/3j",
    description: "Primary action to create an audience",
  },
  createAudienceTitle: {
    defaultMessage: "New audience",
    id: "62W/+huMer",
    description: "Dialog title for creating an audience",
  },
  createAudienceDescription: {
    defaultMessage: "Name the group. You will add the rules on the next screen.",
    id: "Ib0P2u7+iJ",
    description: "Dialog description for creating an audience",
  },
  audienceNameLabel: {
    defaultMessage: "Name",
    id: "nhCef6BJRC",
    description: "Label for an audience name field",
  },
  audienceNamePlaceholder: {
    defaultMessage: "Visitors in Japan",
    id: "/6TXnaU0jG",
    description: "Placeholder for an audience name field",
  },
  audienceDescriptionLabel: {
    defaultMessage: "Note",
    id: "dMFejDlTkV",
    description: "Label for an audience description field",
  },
  audienceRulesTitle: {
    defaultMessage: "Who is in this group",
    id: "XYc39kK48R",
    description: "Heading for the audience rule builder",
  },
  audienceRulesHint: {
    defaultMessage: "Add rules your site already knows, like country or plan.",
    id: "5136tas9La",
    description: "Hint above the audience rule builder",
  },
  matchAll: {
    defaultMessage: "Match all rules",
    id: "oiLDAv4P0Y",
    description: "AND combiner for audience rules",
  },
  matchAny: {
    defaultMessage: "Match any rule",
    id: "MkqKhlkKrU",
    description: "OR combiner for audience rules",
  },
  addRule: {
    defaultMessage: "Add rule",
    id: "kNmR4YupCp",
    description: "Button to add an audience rule",
  },
  removeRule: {
    defaultMessage: "Remove",
    id: "KCFYEP2kSl",
    description: "Button to remove an audience rule",
  },
  ruleAttributeLabel: {
    defaultMessage: "Visitor detail",
    id: "ESCNKuncv0",
    description: "Label for the audience rule attribute",
  },
  ruleMatchLabel: {
    defaultMessage: "Match",
    id: "s5RugBAR2H",
    description: "Label for the audience rule match operator",
  },
  ruleValueLabel: {
    defaultMessage: "Value",
    id: "J/R20j7EMz",
    description: "Label for the audience rule value",
  },
  ruleValueHint: {
    defaultMessage: "For several values, separate them with commas.",
    id: "uHGxQOzsqu",
    description: "Hint for multi-value audience rules",
  },
  customAttribute: {
    defaultMessage: "Something else",
    id: "FJ2ymqjEF1",
    description: "Option to type a custom audience attribute",
  },
  noRules: {
    defaultMessage: "No rules yet. Add one so this audience matches the right visitors.",
    id: "QJRO0AEOO2",
    description: "Empty state inside the audience rule builder",
  },
  audienceEveryone: {
    defaultMessage: "Everyone",
    id: "DXZGjGAKdK",
    description: "Audience selector option for no audience",
  },
  editAudience: {
    defaultMessage: "Edit audience",
    id: "dxFuzry7hR",
    description: "Link to edit the selected audience",
  },
  audienceColumnRules: {
    defaultMessage: "Rules",
    id: "ubB8x9yhxY",
    description: "Audiences table column for rule summary",
  },
  criterionLabel: {
    defaultMessage: "Rules",
    id: "jDQFCCUjVA",
    description: "Label for audience targeting rules",
  },
  criterionHint: {
    defaultMessage: "Example: country is JP",
    id: "ZgIfEPK18j",
    description: "Hint showing a sample audience rule",
  },
  keysTitle: {
    defaultMessage: "API keys",
    id: "QhNCkDX/2a",
    description: "Client keys page title",
  },
  keysDescription: {
    defaultMessage:
      "Create a key and send it to whoever plugs Hyperlab into your site. You only see the full key once.",
    id: "gOqf5qjv10",
    description: "Client keys page description",
  },
  keysEmptyTitle: {
    defaultMessage: "No API keys yet",
    id: "uWVRoUcFw2",
    description: "Empty state title for the keys list",
  },
  keysEmpty: {
    defaultMessage: "Create a key when you are ready for your site to start reading tests.",
    id: "rRY5jwW8rj",
    description: "Empty state for the client keys list",
  },
  createKey: {
    defaultMessage: "New key",
    id: "RLmOisnuYl",
    description: "Primary action to create a client key",
  },
  createKeyTitle: {
    defaultMessage: "New API key",
    id: "9s0L4hgi9B",
    description: "Dialog title for creating a client key",
  },
  createKeyDescription: {
    defaultMessage: "Name it after the site or environment, like Production website.",
    id: "Phw7lnT5pT",
    description: "Dialog description for creating a client key",
  },
  keyNameLabel: {
    defaultMessage: "Name",
    id: "lItQnsuCw5",
    description: "Label for a client key name field",
  },
  keyNamePlaceholder: {
    defaultMessage: "Production website",
    id: "dHzZzNJO6i",
    description: "Placeholder for a client key name field",
  },
  keyPrefixColumn: {
    defaultMessage: "Key",
    id: "xAF/zzu4cl",
    description: "Keys table column for the key prefix",
  },
  revoke: {
    defaultMessage: "Turn off",
    id: "RSG9yRsAq1",
    description: "Button to revoke a client key",
  },
  revoked: {
    defaultMessage: "Turned off",
    id: "S7OxA75SUN",
    description: "Badge for a revoked client key",
  },
  copySecret: {
    defaultMessage: "Copy this key now. You will not see it again.",
    id: "NccsQq74zH",
    description: "Warning shown after creating a client key",
  },
  copyKey: {
    defaultMessage: "Copy key",
    id: "iz+EA2j9GK",
    description: "Button to copy a newly created client key",
  },
  configJsonLabel: {
    defaultMessage: "Always-on value",
    id: "8w1VI67lB8",
    description: "Label for a config flag JSON value",
  },
  configJsonHint: {
    defaultMessage: "Your developer will tell you the shape. Paste the value they need.",
    id: "2+cYRmg3ua",
    description: "Hint for the config flag JSON field",
  },
  invalidJson: {
    defaultMessage: "This needs to be valid JSON.",
    id: "M6Srmv7irr",
    description: "Error when config JSON cannot be parsed",
  },
  assignmentsTitle: {
    defaultMessage: "Used in",
    id: "oMMt65+GLA",
    description: "Heading for flag-to-variant assignments on a flag",
  },
  noAssignments: {
    defaultMessage: "This flag is not on any experiment yet. Add it from an experiment version.",
    id: "eWXns7I3vJ",
    description: "Empty state when a flag has no assignments",
  },
  attachVariant: {
    defaultMessage: "Attach version",
    id: "oLGq0JZhhv",
    description: "Button to attach a flag to a variant",
  },
  variantIdLabel: {
    defaultMessage: "Version",
    id: "oD4c197bVX",
    description: "Label for the variant field when assigning a flag",
  },
  enabledLabel: {
    defaultMessage: "On for this version",
    id: "Aiud8woq39",
    description: "Label for the assignment enabled switch",
  },
  audienceOptional: {
    defaultMessage: "Audience",
    id: "Q3VYIeO77d",
    description: "Label for an optional audience selector",
  },
  audienceRolloutHint: {
    defaultMessage: "Leave this on Everyone unless the test should only run for a saved group.",
    id: "LOiOvyF3WS",
    description: "Hint for experiment-level audience",
  },
  variantAudienceHint: {
    defaultMessage: "Optional. Use this when each version should reach a different group.",
    id: "3+7H4nfe8E",
    description: "Hint for variant-level audience",
  },
  none: {
    defaultMessage: "None",
    id: "0MYRurYa5M",
    description: "Empty option for optional selectors",
  },
  generalCardTitle: {
    defaultMessage: "About this flag",
    id: "/RGHw4Nz6E",
    description: "Heading for flag details card",
  },
  deleteFlagTitle: {
    defaultMessage: "Delete this flag?",
    id: "CvmhaODhjB",
    description: "Confirm dialog title for deleting a flag",
  },
  deleteFlagBody: {
    defaultMessage: "“{name}” will be removed. Experiments that use it will lose this change.",
    id: "ZrnNriGcCC",
    description: "Confirm dialog body for deleting a flag",
  },
  advancedSettings: {
    defaultMessage: "More options",
    id: "88AdkbjRBH",
    description: "Collapsible trigger for advanced create-flag settings",
  },
});
