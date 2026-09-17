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

export const addDomainDialogMessages = defineMessages({
  title: {
    id: "GvUbPf6mr6",
    defaultMessage: "Add a domain",
    description: "Dialog title",
  },
  description: {
    id: "JNdoGRjKr4",
    defaultMessage: "Connect a domain, verify ownership, and choose the markets to research.",
    description: "Dialog description",
  },
  detailsStep: {
    id: "X6zab6Xiik",
    defaultMessage: "Domain details",
    description: "Stepper label",
  },
  connectStep: {
    id: "eETzHxrXFR",
    defaultMessage: "Connect",
    description: "Stepper label",
  },
  marketsStep: {
    id: "ZYSBgdbiSM",
    defaultMessage: "Research markets",
    description: "Stepper label",
  },
  projectStep: {
    id: "p4xkAKJ/3y",
    defaultMessage: "Project",
    description: "Stepper label",
  },
  currentStep: {
    id: "huDI2cWszo",
    defaultMessage: "Current step",
    description: "Screen-reader label",
  },
  completedStep: {
    id: "x3NCeF125H",
    defaultMessage: "Completed",
    description: "Screen-reader label",
  },
  errorTitle: {
    id: "1e6LzoOCGq",
    defaultMessage: "Something went wrong",
    description: "Error title",
  },
  domainLabel: {
    id: "PNbl++WTJZ",
    defaultMessage: "Domain",
    description: "Domain field label",
  },
  domainPlaceholder: {
    id: "RyWMmOUI3f",
    defaultMessage: "example.com",
    description: "Domain field placeholder",
  },
  domainDescription: {
    id: "pSbrixngtF",
    defaultMessage: "Use your root domain without a path.",
    description: "Domain field help",
  },
  preparing: {
    id: "truVoWHnsU",
    defaultMessage: "Preparing…",
    description: "Loading button label",
  },
  continue: {
    id: "3UtT5HKUXH",
    defaultMessage: "Continue",
    description: "Continue button label",
  },
  verifyDomain: {
    id: "fUsluXqG6t",
    defaultMessage: "Verify {domain}",
    description: "Verification heading",
  },
  verifyDescription: {
    id: "CyWbjUsJQp",
    defaultMessage: "Choose the verification method that works best for your site.",
    description: "Verification help",
  },
  pending: {
    id: "GIB7hmrXGj",
    defaultMessage: "Pending",
    description: "Verification status",
  },
  verificationMethod: {
    id: "z2bAu9ByVm",
    defaultMessage: "Verification method",
    description: "Verification method label",
  },
  dnsTxt: {
    id: "bSLGYWqIO6",
    defaultMessage: "DNS TXT",
    description: "Verification method",
  },
  dnsTxtDescription: {
    id: "OlLKnWDUCM",
    defaultMessage: "Best for most domains.",
    description: "Verification method help",
  },
  htmlFile: {
    id: "lg/OPVxZqL",
    defaultMessage: "HTML file",
    description: "Verification method",
  },
  htmlFileDescription: {
    id: "vcIHG9+CIG",
    defaultMessage: "Upload a verification file.",
    description: "Verification method help",
  },
  metaTag: {
    id: "QDnUDnYpNK",
    defaultMessage: "Meta tag",
    description: "Verification method",
  },
  metaTagDescription: {
    id: "MNN5hxxIee",
    defaultMessage: "Add a tag to your homepage.",
    description: "Verification method help",
  },
  recommended: {
    id: "vt4od28KGt",
    defaultMessage: "Recommended",
    description: "Recommended badge",
  },
  host: {
    id: "bfD0UZF1jK",
    defaultMessage: "Host",
    description: "DNS record field",
  },
  type: {
    id: "6yaavRBz1O",
    defaultMessage: "Type",
    description: "DNS record field",
  },
  value: {
    id: "pub66zuKea",
    defaultMessage: "Value",
    description: "DNS record field",
  },
  path: {
    id: "1rDYh6A91a",
    defaultMessage: "Path",
    description: "Verification file field",
  },
  contents: {
    id: "F/MRja++5U",
    defaultMessage: "Contents",
    description: "Verification file field",
  },
  copyTxt: {
    id: "usnDliUsLA",
    defaultMessage: "Copy TXT value",
    description: "Copy button label",
  },
  copyFile: {
    id: "VqCMClnRVk",
    defaultMessage: "Copy verification file contents",
    description: "Copy button label",
  },
  copyMeta: {
    id: "roRELSt0Y8",
    defaultMessage: "Copy meta tag",
    description: "Copy button label",
  },
  metaInstruction: {
    id: "LIc/7+OiWx",
    defaultMessage: "Add this meta tag inside your homepage header.",
    description: "Meta tag instruction",
  },
  copied: {
    id: "94jQfi10Cd",
    defaultMessage: "Verification value copied.",
    description: "Copy status",
  },
  dnsPropagation: {
    id: "h7r8uM5Rio",
    defaultMessage: "DNS changes can take a few minutes to propagate.",
    description: "DNS help",
  },
  fileReachable: {
    id: "6F6TSGIXMs",
    defaultMessage: "The file must be publicly reachable at the exact path.",
    description: "File verification help",
  },
  homepageReachable: {
    id: "kpX0H8ITNs",
    defaultMessage: "The homepage must be publicly reachable for verification.",
    description: "Meta verification help",
  },
  back: { id: "oo/YC7RzA/", defaultMessage: "Back", description: "Back button label" },
  verify: {
    id: "p0UpnHGnqj",
    defaultMessage: "I’ve added it — Verify",
    description: "Verify button label",
  },
  verifying: {
    id: "ID8/Uh0hWv",
    defaultMessage: "Verifying…",
    description: "Loading button label",
  },
  marketsTitle: {
    id: "UiokynE7a1",
    defaultMessage: "Choose research markets",
    description: "Markets heading",
  },
  marketsDescription: {
    id: "hpEuLm7FAW",
    defaultMessage:
      "We found these markets with the strongest signals for {domain}. You can change the selection.",
    description: "Markets help",
  },
  dataForSeo: {
    id: "kzMTx+wIMg",
    defaultMessage: "Powered by DataForSEO Labs’ Google Domain Rank Overview API.",
    description: "Market data attribution",
  },
  findingMarkets: {
    id: "luuUuOK83f",
    defaultMessage: "Finding recommended markets…",
    description: "Markets loading status",
  },
  strongSignal: {
    id: "zjudWIklTn",
    defaultMessage: "Strong signal",
    description: "Market tier",
  },
  emergingSignal: {
    id: "Dr9mxEYa6s",
    defaultMessage: "Emerging signal",
    description: "Market tier",
  },
  newOpportunity: {
    id: "zRMNg+Lp1z",
    defaultMessage: "New opportunity",
    description: "Market tier",
  },
  rankingKeywords: {
    id: "sLmZG0yQ3C",
    defaultMessage: "{count} ranking keywords",
    description: "Market metric",
  },
  estimatedVisits: {
    id: "TBPUwXAr0t",
    defaultMessage: "{count} estimated visits",
    description: "Market metric",
  },
  topTen: {
    id: "UMv47+iyoD",
    defaultMessage: "{count} top-10",
    description: "Market metric",
  },
  noRecommendations: {
    id: "ONBegCBs6b",
    defaultMessage:
      "No recommendations were found. Select at least one supported market to continue.",
    description: "Markets empty state",
  },
  continueToProject: {
    id: "t2Wtf62nXs",
    defaultMessage: "Continue to project",
    description: "Continue button label",
  },
  projectTitle: {
    id: "nUY9Xle8Ej",
    defaultMessage: "Choose a project",
    description: "Project heading",
  },
  projectDescription: {
    id: "Rhnh/znHl6",
    defaultMessage: "Decide where {domain} should be attached after verification.",
    description: "Project help",
  },
  projectAttachment: {
    id: "x6CTl1782r",
    defaultMessage: "Project attachment",
    description: "Project field label",
  },
  lastStep: {
    id: "5nn7QilDF9",
    defaultMessage:
      "This is the last step. You can change the assignment later from the domain page.",
    description: "Project help",
  },
  createProject: {
    id: "csuMeaGNQo",
    defaultMessage: "Create new project",
    description: "Project option",
  },
  namedAfterDomain: {
    id: "ecyqxH2Yby",
    defaultMessage: "Named after this domain",
    description: "Project option help",
  },
  existingProject: {
    id: "BdNQiw66N3",
    defaultMessage: "Use existing project",
    description: "Project option",
  },
  loadingProjects: {
    id: "Sl1sz696FJ",
    defaultMessage: "Loading projects…",
    description: "Project option help",
  },
  availableProjects: {
    id: "YJX0z4m/UU",
    defaultMessage: "{count} available",
    description: "Project option help",
  },
  noProjects: {
    id: "OpuUJxk1lB",
    defaultMessage: "No projects available",
    description: "Project option help",
  },
  leaveUnassigned: {
    id: "Fe3r00g1BD",
    defaultMessage: "Leave unassigned",
    description: "Project option",
  },
  assignLater: {
    id: "COekQctDK+",
    defaultMessage: "Assign it later",
    description: "Project option help",
  },
  selectExisting: {
    id: "cF5KFpXkuE",
    defaultMessage: "Select a project",
    description: "Project select placeholder",
  },
  finishing: {
    id: "oU++pjNQ2m",
    defaultMessage: "Finishing…",
    description: "Loading button label",
  },
  addSelectedMarkets: {
    id: "pbPMcXnHkC",
    defaultMessage: "Add selected markets",
    description: "Submit button label",
  },
  saveSelectedMarkets: {
    id: "FgFTX9ttZW",
    defaultMessage: "Save markets",
    description: "Submit button label when editing linked domain markets",
  },
  marketSelectionRequired: {
    id: "gV0ro12ITy",
    defaultMessage: "Select at least one market to continue.",
    description: "Required market selection validation message",
  },
  marketSelectionLimit: {
    id: "6L6wa37ZDx",
    defaultMessage: "You can select up to 16 markets.",
    description: "Maximum market selection message",
  },
  invalidDomain: {
    id: "ezTvHw7x6I",
    defaultMessage: "Enter a valid domain, like example.com.",
    description: "Domain validation error",
  },
  duplicateDomain: {
    id: "95cBgTM22v",
    defaultMessage: "This domain is already linked. Edit its research markets instead.",
    description: "Duplicate domain error",
  },
  startError: {
    id: "LuycP96soI",
    defaultMessage: "Could not start domain setup.",
    description: "Domain setup error",
  },
  verifyError: {
    id: "ytXJ9hE4wk",
    defaultMessage: "Verification failed.",
    description: "Verification error",
  },
  recommendationsError: {
    id: "VhXGN4Fsgz",
    defaultMessage: "Could not load market recommendations.",
    description: "Market recommendation error",
  },
  selectProjectError: {
    id: "DznPBLz/y6",
    defaultMessage: "Select a project to continue.",
    description: "Project validation error",
  },
  createProjectError: {
    id: "WpmxmqAZMQ",
    defaultMessage: "Could not create the project.",
    description: "Project creation error",
  },
  attachProjectError: {
    id: "GSd2SW1wXQ",
    defaultMessage: "Could not attach the project.",
    description: "Project attachment error",
  },
  saveMarketsError: {
    id: "Gab1SK2EhW",
    defaultMessage: "Could not save research markets.",
    description: "Market save error",
  },
  finishError: {
    id: "9O5X8+eR3t",
    defaultMessage: "Could not finish domain setup.",
    description: "Domain setup error",
  },
});
