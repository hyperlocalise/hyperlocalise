"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const planUsageSummaryMessages = defineMessages({
  loadingPlanUsageAriaLabel: {
    defaultMessage: "Loading plan usage",
    id: "wgpJwxQgNi",
    description: "Accessible label for the plan usage summary skeleton",
  },
  noActivePlan: {
    defaultMessage: "No active plan",
    id: "TPju9eiMWa",
    description: "Fallback plan name when the workspace has no active subscription",
  },
  loadingPlan: {
    defaultMessage: "Loading plan",
    id: "w4kK/l0YhQ",
    description: "Plan name shown on the footer control while billing data is loading",
  },
  chooseAPlan: {
    defaultMessage: "Choose a plan",
    id: "lYqcYOvV+9",
    description: "Plan name shown on the footer control when no plan is active",
  },
  openPlanUsageAriaLabel: {
    defaultMessage: "Open plan usage: {planName}",
    id: "+54c7/3Jjq",
    description: "Accessible label for the footer button that opens the plan usage dialog",
  },
  loadingWorkspacePlanTitle: {
    defaultMessage: "Loading your workspace plan",
    id: "kwuZYApNor",
    description: "Dialog title while workspace plan details are loading",
  },
  activeWorkspacePlanTitle: {
    defaultMessage: "Your workspace is on the {planName} plan",
    id: "fe0NpLPPQl",
    description: "Dialog title when the workspace has an active plan",
  },
  currentPlanFallback: {
    defaultMessage: "current",
    id: "t1mgNhpwfB",
    description: "Fallback plan name in the active-plan dialog title when the plan name is unknown",
  },
  chooseWorkspacePlanTitle: {
    defaultMessage: "Choose a plan for your workspace",
    id: "t2bWzwhvc/",
    description: "Dialog title when the workspace has no active plan",
  },
  dialogDescription: {
    defaultMessage: "Review current usage here or open billing for complete plan details.",
    id: "b/QXf7p3ev",
    description: "Dialog description for the plan usage summary",
  },
  loadError: {
    defaultMessage: "Couldn’t load plan usage. Open billing to try again.",
    id: "FCCakqtYG4",
    description: "Error message when plan usage data fails to load",
  },
  seeAllPlans: {
    defaultMessage: "See all plans",
    id: "MOBnxmS8ik",
    description: "Link to the available plans section from the plan usage dialog",
  },
  openBilling: {
    defaultMessage: "Open billing",
    id: "eTERhCaPbB",
    description: "Link to the billing page from the plan usage dialog",
  },
  accessUntil: {
    defaultMessage: "Access until {date}",
    id: "l8JOw0VDJ/",
    description: "Renewal copy when the active plan is scheduled to cancel",
  },
  renewsOn: {
    defaultMessage: "Renews on {date}",
    id: "kOJgaHjhFH",
    description: "Renewal copy for an active plan that renews on a date",
  },
});
