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
import type { Decorator } from "@storybook/nextjs-vite";

import {
  createGuidelineAssignmentMswHandlers,
  createGuidelineDocumentsMswHandlers,
} from "./guideline-story-fixtures";

export const guidelinePageWidthDecorator: Decorator = (Story) => (
  <div className="w-[880px] max-w-[92vw]">
    <Story />
  </div>
);

export const guidelineListWidthDecorator: Decorator = (Story) => (
  <div className="w-[720px] max-w-[90vw]">
    <Story />
  </div>
);

export const guidelineDialogWidthDecorator: Decorator = (Story) => (
  <div className="w-[min(56rem,calc(100vw-2rem))]">
    <Story />
  </div>
);

export function emptyGuidelineUploadMswHandlers() {
  return [
    ...createGuidelineDocumentsMswHandlers({ documents: [] }),
    ...createGuidelineAssignmentMswHandlers({}),
  ];
}
