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
import Link from "next/link";
import { FormattedMessage } from "react-intl";
import { PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

import { knowledgePageViewMessages } from "./knowledge-page-view.messages";

export function KnowledgePageHeader({ addSourcesHref }: { addSourcesHref?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-end gap-2">
      <h1 className="sr-only">
        <FormattedMessage {...knowledgePageViewMessages.title} />
      </h1>
      {addSourcesHref ? (
        <Button
          type="button"
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={addSourcesHref} />}
        >
          <PlusIcon data-icon="inline-start" />
          <FormattedMessage {...knowledgePageViewMessages.addSources} />
        </Button>
      ) : null}
    </header>
  );
}
