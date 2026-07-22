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

struct MessageBubble: View {
    let message: ChatDisplayMessage

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user { Spacer(minLength: 80) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 6) {
                Text(roleLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Text(message.text.isEmpty && message.isStreaming ? "…" : message.text)
                    .font(HLTheme.bodyFont)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(background)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .animation(.easeInOut(duration: 0.15), value: message.text)
            }

            if message.role != .user { Spacer(minLength: 80) }
        }
    }

    private var roleLabel: String {
        switch message.role {
        case .user: "You"
        case .assistant: "Agent"
        case .system: "System"
        }
    }

    private var background: some ShapeStyle {
        switch message.role {
        case .user:
            HLTheme.moss.opacity(0.14)
        case .assistant:
            Color(nsColor: .textBackgroundColor)
        case .system:
            HLTheme.clay.opacity(0.12)
        }
    }
}
