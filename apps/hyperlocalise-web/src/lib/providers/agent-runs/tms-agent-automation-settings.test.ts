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
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS,
  mergeTmsAgentAutomationSettings,
  requiresManualWriteBackApproval,
  shouldAutoRunQaOnSyncedJob,
  validateTmsAgentAutomationSettingsPatch,
} from "./tms-agent-automation-settings";

describe("tms agent automation settings defaults", () => {
  it("uses safe defaults when no overrides exist", () => {
    expect(DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS).toEqual({
      autoRunQaOnSyncedJobs: false,
      autoDraftTranslations: {
        enabled: false,
        locales: [],
      },
      writeBack: {
        requireManualApproval: true,
        autoWriteBackEnabled: false,
      },
    });
  });

  it("keeps manual approval required by default after merge", () => {
    const merged = mergeTmsAgentAutomationSettings(DEFAULT_TMS_AGENT_AUTOMATION_SETTINGS, {
      writeBack: { autoWriteBackEnabled: false },
    });

    expect(requiresManualWriteBackApproval(merged)).toBe(true);
    expect(shouldAutoRunQaOnSyncedJob(merged)).toBe(false);
  });

  it("rejects enabling auto write-back without manual approval", () => {
    expect(
      validateTmsAgentAutomationSettingsPatch({
        writeBack: {
          autoWriteBackEnabled: true,
          requireManualApproval: false,
        },
      }),
    ).toBe("auto_write_back_requires_manual_approval");
  });
});
