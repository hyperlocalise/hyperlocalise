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
import Foundation

/// Extracts assistant-visible text from AI SDK UIMessage SSE JSON payloads.
enum ChatStreamParser {
    static func extractAssistantText(from jsonPayload: String) -> String? {
        guard let data = jsonPayload.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data)
        else {
            return nil
        }
        return extractText(from: object)
    }

    static func extractText(from value: Any) -> String? {
        if let dict = value as? [String: Any] {
            if let type = dict["type"] as? String {
                // UI message stream chunks
                if type == "text-delta" || type == "text" {
                    if let delta = dict["delta"] as? String { return delta }
                    if let text = dict["text"] as? String { return text }
                }
            }

            // Full UIMessage snapshot
            if let role = dict["role"] as? String, role == "assistant",
               let parts = dict["parts"] as? [[String: Any]]
            {
                let text = parts.compactMap { part -> String? in
                    guard let type = part["type"] as? String else { return nil }
                    if type == "text" { return part["text"] as? String }
                    return nil
                }.joined()
                return text.isEmpty ? nil : text
            }

            // Nested message object
            if let message = dict["message"] {
                return extractText(from: message)
            }
        }

        if let array = value as? [Any] {
            let joined = array.compactMap { extractText(from: $0) }.joined()
            return joined.isEmpty ? nil : joined
        }

        return nil
    }

    /// Merges stream deltas into a running assistant transcript.
    static func apply(eventJSON: String, to current: inout String) -> Bool {
        guard let data = eventJSON.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return false
        }

        if let type = object["type"] as? String {
            if type == "text-delta", let delta = object["delta"] as? String {
                current += delta
                return true
            }
            if type == "text", let text = object["text"] as? String {
                current = text
                return true
            }
        }

        if let snapshot = extractText(from: object) {
            // Prefer longer snapshot (full message replace) when it grows.
            if snapshot.count >= current.count {
                current = snapshot
                return true
            }
        }
        return false
    }
}
