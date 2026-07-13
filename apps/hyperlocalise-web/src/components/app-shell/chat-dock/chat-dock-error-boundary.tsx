"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode, useRef } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { chatDockMessages } from "./chat-dock.messages";
import { ChatDockStore } from "./chat-dock-store";
import { getChatStreamManager } from "./chat-stream-manager";

function logChatDockError(error: Error, info: ErrorInfo) {
  // Omit message/stack — render errors can include conversation text or API bodies.
  console.error("[chat-dock:panel]", {
    name: error.name,
    componentStack: info.componentStack,
  });
}

function recoverFailedTab(
  organizationSlug: string,
  chatDock: ChatDockStore,
  tabId: string | null,
  queryClient: QueryClient,
) {
  if (tabId) {
    getChatStreamManager(organizationSlug, chatDock).stop(tabId);
    chatDock.clearStreamSnapshot(tabId);
    chatDock.setLastError(tabId, null);
    void queryClient.invalidateQueries({
      queryKey: ["conversation-messages", tabId],
    });
  }
  void queryClient.invalidateQueries({
    queryKey: ["conversations", organizationSlug],
  });
}

function ChatDockErrorFallback({ resetErrorBoundary }: FallbackProps) {
  const { chatDock } = useAppShellStore();

  return (
    <div className="flex min-h-48 items-center justify-center border-b border-border p-4">
      <Alert variant="destructive" className="max-w-md">
        <AlertCircleIcon />
        <AlertTitle className="text-balance">
          <FormattedMessage {...chatDockMessages.panelErrorTitle} />
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-pretty">
            <FormattedMessage {...chatDockMessages.panelErrorDescription} />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetErrorBoundary}>
              <FormattedMessage {...chatDockMessages.tryAgain} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => chatDock.setPanelOpen(false)}
            >
              <FormattedMessage {...chatDockMessages.closeChat} />
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export const ChatDockErrorBoundary = observer(function ChatDockErrorBoundary({
  children,
  organizationSlug,
}: {
  children: ReactNode;
  organizationSlug: string;
}) {
  const { chatDock } = useAppShellStore();
  const queryClient = useQueryClient();
  const failedTabIdRef = useRef<string | null>(null);

  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => <ChatDockErrorFallback {...fallbackProps} />}
      onError={(error, info) => {
        failedTabIdRef.current = chatDock.activeTabId;
        if (error instanceof Error) {
          logChatDockError(error, info);
        }
      }}
      onReset={() => {
        const failedTabId = failedTabIdRef.current;
        failedTabIdRef.current = null;
        recoverFailedTab(organizationSlug, chatDock, failedTabId, queryClient);
      }}
      resetKeys={[organizationSlug, chatDock.activeTabId, chatDock.panelOpen]}
    >
      {children}
    </ErrorBoundary>
  );
});
