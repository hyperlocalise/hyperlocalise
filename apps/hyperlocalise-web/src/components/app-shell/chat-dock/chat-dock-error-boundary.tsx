"use client";

import { AlertCircleIcon } from "lucide-react";
import { type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { chatDockMessages } from "./chat-dock.messages";
import { getChatStreamManager } from "./chat-stream-manager";

function logChatDockError(error: Error, info: ErrorInfo) {
  console.error("[chat-dock:panel]", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  });
}

function ChatDockErrorFallback({
  resetErrorBoundary,
  organizationSlug,
}: FallbackProps & { organizationSlug: string }) {
  const { chatDock } = useAppShellStore();
  const queryClient = useQueryClient();

  function retry() {
    const activeTab = chatDock.activeTab;
    if (activeTab) {
      getChatStreamManager(organizationSlug, chatDock).stop(activeTab.id);
      chatDock.clearStreamSnapshot(activeTab.id);
      chatDock.setLastError(activeTab.id, null);
      void queryClient.invalidateQueries({
        queryKey: ["conversation-messages", activeTab.id],
      });
    }
    void queryClient.invalidateQueries({
      queryKey: ["conversations", organizationSlug],
    });
    resetErrorBoundary();
  }

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
            <Button type="button" variant="outline" size="sm" onClick={retry}>
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

  return (
    <ErrorBoundary
      fallbackRender={(fallbackProps) => (
        <ChatDockErrorFallback {...fallbackProps} organizationSlug={organizationSlug} />
      )}
      onError={(error, info) => {
        if (error instanceof Error) {
          logChatDockError(error, info);
        }
      }}
      resetKeys={[organizationSlug, chatDock.activeTabId, chatDock.panelOpen]}
    >
      {children}
    </ErrorBoundary>
  );
});
