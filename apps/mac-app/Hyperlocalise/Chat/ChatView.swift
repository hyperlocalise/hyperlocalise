/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import SwiftUI

struct ChatView: View {
    @Environment(AppModel.self) private var appModel
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            messageList
            Divider()
            composer
        }
        .background(HLTheme.mist.opacity(0.35))
        .onAppear { composerFocused = true }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text(appModel.selectedConversationID == nil ? "New conversation" : "Conversation")
                    .font(HLTheme.titleFont)
                Text("Ask the agent to find context and do the work.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if appModel.isStreaming {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Working…")
                        .foregroundStyle(.secondary)
                }
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .animation(.easeInOut(duration: 0.2), value: appModel.isStreaming)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if appModel.messages.isEmpty {
                        emptyState
                    } else {
                        ForEach(appModel.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                }
                .padding(24)
            }
            .onChange(of: appModel.messages.last?.text) { _, _ in
                if let last = appModel.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Start with a localization question")
                .font(.title3.weight(.semibold))
            Text("Examples: “Find where checkout CTA copy lives”, “Translate the onboarding strings for de-DE”, “Open a PR for the glossary update”.")
                .foregroundStyle(.secondary)
                .frame(maxWidth: 520, alignment: .leading)
        }
        .padding(.top, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var composer: some View {
        @Bindable var model = appModel

        return VStack(alignment: .leading, spacing: 10) {
            TextField(
                "Optional repo (owner/name) for find-context",
                text: $model.repositoryFullName
            )
            .textFieldStyle(.roundedBorder)
            .font(HLTheme.monoFont)
            .disabled(appModel.selectedConversationID != nil)

            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message the agent…", text: $model.draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1 ... 6)
                    .focused($composerFocused)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color(nsColor: .textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(HLTheme.fog, lineWidth: 1)
                    )
                    .onSubmit {
                        Task { await appModel.sendDraft() }
                    }

                Button {
                    Task { await appModel.sendDraft() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(HLTheme.moss)
                }
                .buttonStyle(.plain)
                .disabled(
                    appModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || appModel.isStreaming
                )
                .keyboardShortcut(.return, modifiers: [.command])
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
    }
}
