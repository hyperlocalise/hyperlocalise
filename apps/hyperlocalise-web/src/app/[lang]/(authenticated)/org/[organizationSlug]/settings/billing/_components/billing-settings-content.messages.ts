"use client";

import { defineMessages } from "react-intl";

export const billingSettingsContentMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Billing settings",
    id: "eZ9Pa/eLoU",
    description: "Breadcrumb-style label above the billing settings page title",
  },
  pageTitle: {
    defaultMessage: "Billing",
    id: "8toT7pGxD3",
    description: "Billing settings page heading",
  },
  pageDescription: {
    defaultMessage:
      "View your workspace plan, AI credit usage, workspace limits, and subscription billing.",
    id: "Z4Eqaj5jk5",
    description: "Billing settings page description",
  },
  billingUnavailableTitle: {
    defaultMessage: "Billing unavailable",
    id: "1V7FgCulzl",
    description: "Title when Autumn billing is not configured",
  },
  billingUnavailableDescription: {
    defaultMessage:
      "Autumn is not configured in this environment. Add a sandbox AUTUMN_API_KEY to enable billing for this workspace.",
    id: "5Wfh7kerri",
    description: "Explanation when Autumn billing is not configured",
  },
  resourceUsageLoadFailed: {
    defaultMessage: "Failed to load workspace resource usage",
    id: "0Om1h6JDho",
    description: "Error when the workspace resource usage request fails",
  },
  billingReadForbidden: {
    defaultMessage: "You do not have permission to view billing for this workspace.",
    id: "HljRytS7qm",
    description: "Error when the user cannot read billing",
  },
  billingWriteForbidden: {
    defaultMessage: "Only workspace admins can change plans or open the billing portal.",
    id: "7+3fNQzUpN",
    description: "Error when the user cannot change billing",
  },
  billingCustomerUnavailable: {
    defaultMessage: "Billing is not available for this workspace.",
    id: "aXy7jDdqhj",
    description: "Error when the billing customer is unavailable",
  },
  billingUnauthorized: {
    defaultMessage: "Sign in again to manage billing.",
    id: "tJ4ESqRDu1",
    description: "Error when the billing session is unauthorized",
  },
  billingRequestFailed: {
    defaultMessage: "Billing request failed. Try again in a moment.",
    id: "kJE4wAhywD",
    description: "Generic fallback error for billing requests",
  },
  loadingTitle: {
    defaultMessage: "Loading billing",
    id: "1+xLWJmFpS",
    description: "Title while billing data is loading",
  },
  loadingDescription: {
    defaultMessage: "Fetching plan and usage details for this workspace.",
    id: "Wqln3Fs89r",
    description: "Description while billing data is loading",
  },
  loadErrorTitle: {
    defaultMessage: "Unable to load billing",
    id: "Ew8/1Tsgsr",
    description: "Title when billing data fails to load",
  },
  tryAgain: {
    defaultMessage: "Try again",
    id: "9J0I8HNSJA",
    description: "Button to retry loading billing data",
  },
  subscriptionTitle: {
    defaultMessage: "Subscription",
    id: "1c7WoNl9cJ",
    description: "Subscription card title on billing settings",
  },
  subscriptionCancelingDescription: {
    defaultMessage: "Your subscription stays active until the current billing period ends.",
    id: "2ZTMHJN+0R",
    description: "Subscription card description when cancellation is scheduled",
  },
  subscriptionActiveDescription: {
    defaultMessage: "Manage cancellation for this workspace subscription.",
    id: "10wFUk/dew",
    description: "Subscription card description when a subscription is active",
  },
  subscriptionEmptyDescription: {
    defaultMessage: "Choose a plan below to start a subscription for this workspace.",
    id: "oJ52cXcJDI",
    description: "Subscription card description when there is no active subscription",
  },
  statusCanceling: {
    defaultMessage: "Canceling",
    id: "CoMFZXPg5S",
    description: "Badge when the subscription is scheduled to cancel",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "pexFxGun/R",
    description: "Badge when the subscription is active",
  },
  restoringSubscription: {
    defaultMessage: "Restoring…",
    id: "H+WlOu68oG",
    description: "Button label while restoring a canceled subscription",
  },
  restoreSubscription: {
    defaultMessage: "Restore subscription",
    id: "LX+MrzNv6y",
    description: "Button to restore a subscription scheduled for cancellation",
  },
  schedulingCancel: {
    defaultMessage: "Scheduling…",
    id: "49YaqKVm8d",
    description: "Button label while scheduling subscription cancellation",
  },
  cancelAtPeriodEnd: {
    defaultMessage: "Cancel at period end",
    id: "y5nRcvmxtw",
    description: "Button to cancel the subscription at the end of the billing period",
  },
  billingPortalTitle: {
    defaultMessage: "Billing portal",
    id: "zZcXdUF4UF",
    description: "Billing portal card title",
  },
  billingPortalDescription: {
    defaultMessage:
      "Update payment methods, review invoices, and manage subscription billing details.",
    id: "BCYAAWW4I+",
    description: "Billing portal card description",
  },
  openingPortal: {
    defaultMessage: "Opening…",
    id: "1vAzKUeJ7n",
    description: "Button label while opening the billing portal",
  },
  manageBilling: {
    defaultMessage: "Manage billing",
    id: "RMhxTkKsf0",
    description: "Button to open the external billing portal",
  },
  adminOnlyPortal: {
    defaultMessage: "Only workspace admins can open the billing portal.",
    id: "67CBDWHaYl",
    description: "Note shown when the user cannot open the billing portal",
  },
  planUsageTitle: {
    defaultMessage: "Plan usage",
    id: "/HYQsZiVvN",
    description: "Plan usage card title on billing settings",
  },
  planUsageDescription: {
    defaultMessage:
      "AI credit usage resets each billing cycle. Seats, projects, automations, and integrations are workspace limits.",
    id: "FewX0sf1is",
    description: "Plan usage card description on billing settings",
  },
  resetsOn: {
    defaultMessage: "Resets {date}",
    id: "b5I27EcBHD",
    description: "Usage row showing the next reset date for a billing feature",
  },
  noResetDate: {
    defaultMessage: "—",
    id: "+auDy+Mwce",
    description: "Placeholder when a usage feature has no reset date",
  },
  usageUnavailable: {
    defaultMessage: "Usage unavailable",
    id: "YsqTULzKIY",
    description: "Shown when workspace resource usage cannot be loaded",
  },
  unlimited: {
    defaultMessage: "Unlimited",
    id: "07pTu6Ro98",
    description: "Shown when a billing feature has unlimited usage",
  },
  usageUsed: {
    defaultMessage: "{usage} / {granted} used",
    id: "jXIBasnzrF",
    description: "Usage row showing consumed versus granted amount",
  },
  usageRemaining: {
    defaultMessage: "{remaining} remaining",
    id: "o6mkuN62Fv",
    description: "Usage row showing remaining allowance",
  },
  planLimit: {
    defaultMessage: "Plan limit {granted}",
    id: "RfwcN1CxQQ",
    description: "Usage row showing the plan limit when live usage is unavailable",
  },
  availablePlansTitle: {
    defaultMessage: "Available plans",
    id: "2L6MEhuN0z",
    description: "Available plans card title on billing settings",
  },
  availablePlansDescription: {
    defaultMessage:
      "Plans are configured in Autumn. Pricing changes there do not require app migrations.",
    id: "ZyQCAdf77o",
    description: "Available plans card description on billing settings",
  },
  planDescriptionFallback: {
    defaultMessage: "Workspace subscription plan",
    id: "BrXfVaiNs0",
    description: "Fallback description when an Autumn plan has no description",
  },
  currentPlan: {
    defaultMessage: "Current plan",
    id: "AdQUjv5py7",
    description: "Badge for the workspace’s current subscription plan",
  },
  startingPlan: {
    defaultMessage: "Starting…",
    id: "vlONVU+qS/",
    description: "Button label while attaching a subscription plan",
  },
  selectPlan: {
    defaultMessage: "Select plan",
    id: "cJIask/gHT",
    description: "Button to select and attach a subscription plan",
  },
  noPlansConfigured: {
    defaultMessage: "No plans are configured in Autumn yet.",
    id: "TcPLZlmUn0",
    description: "Empty state when Autumn has no plans configured",
  },
  featureAiCredit: {
    defaultMessage: "AI Credit",
    id: "EGVRBepZ6Q",
    description: "Label for the AI credit usage feature on billing settings",
  },
  featureTranslationJobs: {
    defaultMessage: "Translation jobs",
    id: "MUU0MB1WKf",
    description: "Label for the translation jobs usage feature on billing settings",
  },
  featureAgentRuns: {
    defaultMessage: "Agent runs",
    id: "mjUEUJkwz+",
    description: "Label for the agent runs usage feature on billing settings",
  },
  featureSeats: {
    defaultMessage: "Seats",
    id: "3dfZO0kB4v",
    description: "Label for the seats usage feature on billing settings",
  },
  featureProjects: {
    defaultMessage: "Projects",
    id: "5Y40FWbqCY",
    description: "Label for the projects usage feature on billing settings",
  },
  featureAutomations: {
    defaultMessage: "Automations",
    id: "rWC4imiuAY",
    description: "Label for the automations usage feature on billing settings",
  },
  featureIntegrations: {
    defaultMessage: "Integrations",
    id: "74QTrAm8Mn",
    description: "Label for the integrations usage feature on billing settings",
  },
});
