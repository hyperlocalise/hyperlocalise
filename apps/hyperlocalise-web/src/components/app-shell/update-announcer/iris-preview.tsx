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
import { PlayIcon } from "@phosphor-icons/react/ssr";

/** Decorative play badge for the Iris launch-film teaser. */
export function IrisPreview() {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg ring-1 ring-black/10">
        <PlayIcon className="size-5" weight="fill" />
      </span>
    </div>
  );
}
