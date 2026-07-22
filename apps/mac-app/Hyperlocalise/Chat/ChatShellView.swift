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
import SwiftUI

struct ChatShellView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 0) {
                organizationHeader
                Divider()
                conversationList
                Divider()
                footer
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } detail: {
            ChatView()
        }
        .alert("Something went wrong", isPresented: Binding(
            get: { appModel.errorMessage != nil },
            set: { if !$0 { appModel.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { appModel.errorMessage = nil }
        } message: {
            Text(appModel.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private var organizationHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Hyperlocalise")
                .font(.headline)
                .foregroundStyle(HLTheme.moss)

            if let orgs = appModel.authContext?.organizations, !orgs.isEmpty {
                Picker("Organization", selection: Binding(
                    get: { appModel.selectedOrganization },
                    set: { org in
                        guard let org else { return }
                        Task { await appModel.selectOrganization(org) }
                    }
                )) {
                    ForEach(orgs) { org in
                        Text(org.name).tag(Optional(org))
                    }
                }
                .labelsHidden()
            }

            Text(appModel.userEmail ?? "")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(16)
    }

    private var conversationList: some View {
        List(selection: Binding(
            get: { appModel.selectedConversationID },
            set: { id in
                guard let id,
                      let conversation = appModel.conversations.first(where: { $0.id == id })
                else {
                    Task { await appModel.startNewConversation() }
                    return
                }
                Task { await appModel.selectConversation(conversation) }
            }
        )) {
            Button {
                Task { await appModel.startNewConversation() }
            } label: {
                Label("New chat", systemImage: "plus.message")
            }
            .buttonStyle(.plain)

            Section("Recent") {
                ForEach(appModel.conversations) { conversation in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(conversation.title?.isEmpty == false
                            ? conversation.title!
                            : "Untitled chat")
                            .font(.body.weight(.medium))
                            .lineLimit(1)
                        if let preview = conversation.lastMessagePreview, !preview.isEmpty {
                            Text(preview)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    .tag(Optional(conversation.id))
                    .padding(.vertical, 2)
                }
            }
        }
        .listStyle(.sidebar)
    }

    private var footer: some View {
        HStack {
            Button("Sign out") {
                appModel.signOut()
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(12)
    }
}
