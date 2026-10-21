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

export const automationShortcutsMessages = defineMessages({
  dialogTitle: {
    defaultMessage: "Keyboard shortcuts",
    id: "9sp28/HRIS",
    description: "Title of the automation and visual workflow shortcuts dialog",
  },
  dialogDescriptionAutomation: {
    defaultMessage: "These shortcuts work on this automation while you edit it.",
    id: "GUexEsRfuY",
    description: "Description of the workspace automation shortcuts dialog",
  },
  dialogDescriptionWorkflow: {
    defaultMessage: "These shortcuts work on this visual workflow while you edit it.",
    id: "mhEOCKtB8V",
    description: "Description of the visual workflow shortcuts dialog",
  },
  save: {
    defaultMessage: "Save",
    id: "myA+eLggC8",
    description: "Shortcut label for saving an automation or visual workflow",
  },
  runNow: {
    defaultMessage: "Run now",
    id: "+Ly8vgMQC1",
    description: "Shortcut label for running a saved automation",
  },
  create: {
    defaultMessage: "Create automation",
    id: "iZvd3PRyTT",
    description: "Shortcut label for creating a new automation",
  },
  testWorkflow: {
    defaultMessage: "Test workflow",
    id: "VeawOD8ys/",
    description: "Shortcut label for testing a visual workflow",
  },
  assistant: {
    defaultMessage: "Configure with assistant",
    id: "CtglZ/L+Y/",
    description: "Shortcut label for opening or closing the automation assistant",
  },
  undo: {
    defaultMessage: "Undo",
    id: "kc2Bfrbhx2",
    description: "Shortcut label for undo on an automation or visual workflow",
  },
  redo: {
    defaultMessage: "Redo",
    id: "UGOxWduZf+",
    description: "Shortcut label for redo on an automation or visual workflow",
  },
  addNode: {
    defaultMessage: "Add a step",
    id: "ZxA3yFVMTz",
    description: "Shortcut label for opening the visual workflow step picker",
  },
  fitView: {
    defaultMessage: "Fit the canvas",
    id: "88+aLtXaNa",
    description: "Shortcut label for fitting a visual workflow to the canvas",
  },
  shortcuts: {
    defaultMessage: "Show this list",
    id: "gxAzRIjGsu",
    description: "Shortcut label for opening the shortcuts dialog",
  },
  holdToReveal: {
    defaultMessage: "Hold {key}",
    id: "1921gmdhHh",
    description: "Visible chip that tells the user which key reveals shortcut hints",
  },
  holdToRevealTooltip: {
    defaultMessage: "Hold {key} to see shortcuts on the actions. Press ? for the full list.",
    id: "QaRsBsCj+7",
    description: "Tooltip on the hold-to-reveal shortcuts affordance",
  },
  hintRegion: {
    defaultMessage: "Keyboard shortcut",
    id: "CjNPGTfdyg",
    description: "Accessible name for a hold-to-reveal shortcut hint on an action",
  },
  canvasHints: {
    defaultMessage: "Canvas shortcuts",
    id: "Vm0vUMTtIL",
    description: "Accessible name for hold-to-reveal canvas shortcut hints",
  },
  openShortcuts: {
    defaultMessage: "Keyboard shortcuts",
    id: "HPZB+VKYYl",
    description: "Menu item that opens the automation shortcuts dialog",
  },
});
