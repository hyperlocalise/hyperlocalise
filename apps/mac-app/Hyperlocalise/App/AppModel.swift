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
import AppKit
import Observation
import SwiftUI

@MainActor
@Observable
final class AppModel {
    private(set) var isBootstrapping = true
    private(set) var isAuthenticated = false
    private(set) var authContext: AuthContext?
    private(set) var selectedOrganization: AuthOrganization?
    private(set) var conversations: [ConversationSummary] = []
    private(set) var selectedConversationID: String?
    private(set) var messages: [ChatDisplayMessage] = []
    private(set) var isStreaming = false
    private(set) var statusMessage: String?
    var draft = ""
    var repositoryFullName = ""
    var errorMessage: String?

    private let authService: AuthService
    private let apiClient: APIClient

    init(
        authService: AuthService? = nil,
        apiClient: APIClient? = nil
    ) {
        let baseURL = AppConfig.apiBaseURL
        self.authService = authService ?? AuthService(apiBaseURL: baseURL)
        self.apiClient = apiClient ?? APIClient(baseURL: baseURL)
        Task { await bootstrap() }
    }

    var userEmail: String? {
        authContext?.user.email
    }

    func bootstrap() async {
        isBootstrapping = true
        defer { isBootstrapping = false }

        guard let sealed = authService.restoreSealedSession() else {
            isAuthenticated = false
            return
        }

        await apiClient.setSealedSession(sealed)
        do {
            try await refreshAuthContext()
            isAuthenticated = true
            try await refreshConversations()
        } catch {
            authService.signOut()
            await apiClient.setSealedSession(nil)
            isAuthenticated = false
            authContext = nil
        }
    }

    func signIn(from window: NSWindow?) async {
        errorMessage = nil
        statusMessage = "Opening WorkOS…"
        do {
            let anchor = window ?? NSApp.keyWindow ?? ASPresentationFallback.anchor
            _ = try await authService.signIn(from: anchor)
            if let sealed = authService.restoreSealedSession() {
                await apiClient.setSealedSession(sealed)
            }
            try await refreshAuthContext()
            isAuthenticated = true
            try await refreshConversations()
            statusMessage = nil
        } catch AuthServiceError.authorizationCancelled {
            statusMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = nil
        }
    }

    func signOut() {
        authService.signOut()
        Task {
            await apiClient.setSealedSession(nil)
        }
        isAuthenticated = false
        authContext = nil
        selectedOrganization = nil
        conversations = []
        selectedConversationID = nil
        messages = []
        draft = ""
    }

    func selectOrganization(_ organization: AuthOrganization) async {
        selectedOrganization = organization
        selectedConversationID = nil
        messages = []
        do {
            try await refreshConversations()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectConversation(_ conversation: ConversationSummary) async {
        selectedConversationID = conversation.id
        do {
            try await loadMessages(for: conversation.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func startNewConversation() async {
        selectedConversationID = nil
        messages = []
        draft = ""
    }

    func sendDraft() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let organization = selectedOrganization, let slug = organization.slug
        else {
            errorMessage = "Select an organization with a slug before chatting."
            return
        }
        guard !isStreaming else { return }

        errorMessage = nil
        isStreaming = true
        defer { isStreaming = false }

        do {
            let userMessageId: String
            let conversationId: String

            if let existingID = selectedConversationID {
                let created = try await apiClient.sendMessage(
                    organizationSlug: slug,
                    conversationId: existingID,
                    text: text
                )
                conversationId = existingID
                userMessageId = created.id
                draft = ""
                messages.append(
                    ChatDisplayMessage(id: created.id, role: .user, text: text, isStreaming: false)
                )
            } else {
                let created = try await apiClient.createConversation(
                    organizationSlug: slug,
                    text: text,
                    repositoryFullName: repositoryFullName.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                conversationId = created.conversation.id
                userMessageId = created.message.id
                draft = ""
                selectedConversationID = conversationId
                messages = [
                    ChatDisplayMessage(
                        id: created.message.id,
                        role: .user,
                        text: text,
                        isStreaming: false
                    ),
                ]
                try await refreshConversations()
            }

            let assistantID = "stream-\(userMessageId)"
            messages.append(
                ChatDisplayMessage(id: assistantID, role: .assistant, text: "", isStreaming: true)
            )
            var assistantText = ""

            try await apiClient.streamChat(
                organizationSlug: slug,
                conversationId: conversationId,
                userMessageId: userMessageId,
                userText: text
            ) { [weak self] event in
                Task { @MainActor in
                    guard let self else { return }
                    if ChatStreamParser.apply(eventJSON: event, to: &assistantText) {
                        if let index = self.messages.firstIndex(where: { $0.id == assistantID }) {
                            self.messages[index].text = assistantText
                        }
                    }
                }
            }

            if let index = messages.firstIndex(where: { $0.id == assistantID }) {
                messages[index].isStreaming = false
                if messages[index].text.isEmpty {
                    messages[index].text = "…"
                }
            }
            try await refreshConversations()
        } catch APIClientError.unauthorized {
            errorMessage = APIClientError.unauthorized.localizedDescription
            signOut()
        } catch {
            errorMessage = error.localizedDescription
            if let index = messages.firstIndex(where: { $0.isStreaming }) {
                messages[index].isStreaming = false
                if messages[index].text.isEmpty {
                    messages[index].text = "Sorry — the agent could not finish that turn."
                }
            }
        }
    }

    private func refreshAuthContext() async throws {
        let context = try await apiClient.fetchAuthContext()
        authContext = context
        if let selected = selectedOrganization,
           context.organizations.contains(where: { $0.localOrganizationId == selected.localOrganizationId })
        {
            // keep selection
        } else {
            selectedOrganization = context.organizations.first(where: { $0.slug != nil })
                ?? context.organization
        }
    }

    private func refreshConversations() async throws {
        guard let slug = selectedOrganization?.slug else {
            conversations = []
            return
        }
        conversations = try await apiClient.listConversations(organizationSlug: slug)
    }

    private func loadMessages(for conversationId: String) async throws {
        guard let slug = selectedOrganization?.slug else { return }
        let (_, remote) = try await apiClient.fetchConversation(
            organizationSlug: slug,
            conversationId: conversationId
        )
        messages = remote.map { message in
            let role: ChatRole =
                message.senderType == "user" ? .user :
                message.senderType == "system" ? .system :
                .assistant // includes agent
            let textFromParts = message.parts?
                .compactMap(\.text)
                .joined(separator: "\n")
            return ChatDisplayMessage(
                id: message.id,
                role: role,
                text: textFromParts?.isEmpty == false ? textFromParts! : (message.text ?? ""),
                isStreaming: false
            )
        }
    }
}

private enum ASPresentationFallback {
    @MainActor
    static var anchor: NSWindow {
        NSApp.windows.first ?? NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
    }
}
