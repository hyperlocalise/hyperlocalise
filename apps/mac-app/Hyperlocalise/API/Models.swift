import Foundation

struct AuthContextResponse: Decodable, Sendable {
    let auth: AuthContext
}

struct AuthContext: Decodable, Sendable {
    let user: AuthUser
    let organizations: [AuthOrganization]
    let organization: AuthOrganization
}

struct AuthUser: Decodable, Hashable, Sendable {
    let workosUserId: String
    let localUserId: String
    let email: String
}

struct AuthOrganization: Decodable, Hashable, Identifiable, Sendable {
    var id: String { localOrganizationId }
    let workosOrganizationId: String
    let localOrganizationId: String
    let name: String
    let slug: String?
}

struct ConversationLastMessage: Decodable, Hashable, Sendable {
    let text: String?
}

struct ConversationSummary: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String?
    let lastMessage: ConversationLastMessage?
    let lastMessageAt: FlexibleDateString?
    let createdAt: FlexibleDateString?

    var lastMessagePreview: String? { lastMessage?.text }
}

/// Accepts ISO-8601 strings from JSON date serialization.
struct FlexibleDateString: Decodable, Hashable, Sendable {
    let raw: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            raw = string
            return
        }
        if let double = try? container.decode(Double.self) {
            raw = String(double)
            return
        }
        raw = ""
    }
}

struct ConversationsResponse: Decodable, Sendable {
    let conversations: [ConversationSummary]
}

struct ConversationMessage: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let senderType: String
    let text: String?
    let createdAt: String?
    let parts: [MessagePart]?
}

struct MessagePart: Decodable, Hashable, Sendable {
    let type: String?
    let text: String?
}

struct ConversationDetailResponse: Decodable, Sendable {
    let conversation: ConversationSummary
    let messages: [ConversationMessage]?
}

struct CreateConversationResponse: Decodable, Sendable {
    let conversation: ConversationSummary
    let message: ConversationMessage
}

struct CreateMessageResponse: Decodable, Sendable {
    let message: ConversationMessage
}

enum ChatRole: String, Hashable, Sendable {
    case user
    case assistant
    case system
}

struct ChatDisplayMessage: Identifiable, Hashable, Sendable {
    let id: String
    let role: ChatRole
    var text: String
    var isStreaming: Bool
}
