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
import { FormattedMessage } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import { IRIS_WAITLIST_FORM_ID, IRIS_WAITLIST_URL } from "@/lib/iris/iris-waitlist";

type TallyPopup = {
  openPopup: (
    formId: string,
    options?: {
      layout?: "default" | "modal";
      overlay?: boolean;
      width?: number;
    },
  ) => void;
};

function tallyPopup(): TallyPopup | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { Tally?: TallyPopup }).Tally;
}

function loadTallyWidget() {
  if (tallyPopup() || document.querySelector('script[src="https://tally.so/widgets/embed.js"]')) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://tally.so/widgets/embed.js";
  document.body.appendChild(script);
}

export function IrisWaitlistCta({ className }: { className?: string }) {
  return (
    <a
      className={className}
      href={IRIS_WAITLIST_URL}
      onClick={(event) => {
        const tally = tallyPopup();
        if (!tally) {
          return;
        }

        event.preventDefault();
        tally.openPopup(IRIS_WAITLIST_FORM_ID, {
          layout: "modal",
          overlay: true,
          width: 480,
        });
      }}
      onFocus={loadTallyWidget}
      onMouseEnter={loadTallyWidget}
      rel="noopener noreferrer"
      target="_blank"
    >
      <FormattedMessage {...irisPageMessages.joinWaitlist} />
    </a>
  );
}
