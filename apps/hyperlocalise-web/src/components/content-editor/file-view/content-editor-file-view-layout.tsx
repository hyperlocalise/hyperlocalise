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
import type { ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { Box } from "@/components/ui/layout/box";
import { Row } from "@/components/ui/layout/row";
import { Text, Title } from "@/components/ui/typography";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";

export function FileViewHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border/50 bg-background/90 backdrop-blur-md">
      <Box display="flex" alignItems="center" height="full" paddingX="2u" width="full">
        {children}
      </Box>
    </header>
  );
}

export function FileViewLocalePill({ children }: { children: ReactNode }) {
  return (
    <span className="hidden shrink-0 sm:inline-flex">
      <Box
        display="inline-flex"
        borderRadius="full"
        background="muted"
        paddingX="1u"
        paddingY="0.5u"
      >
        <Text size="xsmall" weight="medium" tone="subtle" tagName="span">
          {children}
        </Text>
      </Box>
    </span>
  );
}

export function FileViewWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30 dark:bg-muted/15">
      <div className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">{children}</div>
    </div>
  );
}

export function FileViewWorkspaceContent({
  layout,
  children,
}: {
  layout: "split" | "single";
  children: ReactNode;
}) {
  return (
    <div
      className={
        layout === "split"
          ? "mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col"
          : "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col"
      }
    >
      {children}
    </div>
  );
}

export function FileViewPaneColumn({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>;
}

export function FileViewPane({
  title,
  toolbar,
  footer,
  children,
}: {
  title: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <FileViewPaneLabel>{title}</FileViewPaneLabel>
      <FileViewPage toolbar={toolbar} footer={footer}>
        {children}
      </FileViewPage>
    </div>
  );
}

function FileViewPaneLabel({ children }: { children: ReactNode }) {
  return (
    <Title tagName="h3" size="xxsmall" weight="medium" tone="subtle">
      {children}
    </Title>
  );
}

export function FileViewPage({
  toolbar,
  footer,
  children,
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {toolbar ? (
        <div className="shrink-0 border-b border-border/60 bg-muted/20 px-3 py-1.5">
          <Row spacing="1u" alignY="center">
            {toolbar}
          </Row>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-border/60 px-3 py-3">
          <Row spacing="1u" align="end" alignY="center">
            {footer}
          </Row>
        </div>
      ) : null}
    </div>
  );
}

export function FileViewPaneState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[16rem] flex-1 items-center justify-center p-8">
      <Text size="small" tone="subtle" alignment="center">
        {children}
      </Text>
    </div>
  );
}

export function FileViewUnsupportedPreview() {
  return (
    <FileViewPaneState>
      <FormattedMessage {...contentEditorFileViewMessages.previewUnsupported} />
    </FileViewPaneState>
  );
}
