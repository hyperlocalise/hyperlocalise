import Foundation

enum APIClientError: Error, LocalizedError {
    case unauthorized
    case http(status: Int, body: String)
    case decoding(Error)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session expired. Sign in again."
        case .http(let status, let body):
            return "Request failed (\(status)): \(body)"
        case .decoding(let error):
            return "Could not read server response: \(error.localizedDescription)"
        case .invalidResponse:
            return "Invalid server response."
        }
    }
}

actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private var sealedSession: String?

    init(baseURL: URL, sealedSession: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.sealedSession = sealedSession
        self.session = session
    }

    func setSealedSession(_ value: String?) {
        sealedSession = value
    }

    func fetchAuthContext() async throws -> AuthContext {
        let data = try await requestData(path: "/api/auth/context", method: "GET")
        return try decode(AuthContextResponse.self, from: data).auth
    }

    func listConversations(organizationSlug: String) async throws -> [ConversationSummary] {
        let data = try await requestData(
            path: "/api/orgs/\(organizationSlug)/conversations",
            method: "GET"
        )
        return try decode(ConversationsResponse.self, from: data).conversations
    }

    func fetchConversation(
        organizationSlug: String,
        conversationId: String
    ) async throws -> (ConversationSummary, [ConversationMessage]) {
        let data = try await requestData(
            path: "/api/orgs/\(organizationSlug)/conversations/\(conversationId)",
            method: "GET"
        )
        // Detail endpoints may nest messages at top-level or omit them; also try /messages.
        if let detail = try? decode(ConversationDetailResponse.self, from: data),
           let messages = detail.messages
        {
            return (detail.conversation, messages)
        }

        let messagesData = try await requestData(
            path: "/api/orgs/\(organizationSlug)/conversations/\(conversationId)/messages",
            method: "GET"
        )
        struct MessagesEnvelope: Decodable { let messages: [ConversationMessage] }
        let conversation: ConversationSummary
        if let detail = try? decode(ConversationDetailResponse.self, from: data) {
            conversation = detail.conversation
        } else {
            conversation = ConversationSummary(
                id: conversationId,
                title: nil,
                lastMessage: nil,
                lastMessageAt: nil,
                createdAt: nil
            )
        }
        let messages = try decode(MessagesEnvelope.self, from: messagesData).messages
        return (conversation, messages)
    }

    func createConversation(
        organizationSlug: String,
        text: String,
        repositoryFullName: String? = nil
    ) async throws -> CreateConversationResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        appendField("text", text)
        if let repositoryFullName, !repositoryFullName.isEmpty {
            appendField("repositoryFullName", repositoryFullName)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let data = try await requestData(
            path: "/api/orgs/\(organizationSlug)/conversations",
            method: "POST",
            headers: ["Content-Type": "multipart/form-data; boundary=\(boundary)"],
            body: body
        )
        return try decode(CreateConversationResponse.self, from: data)
    }

    func sendMessage(
        organizationSlug: String,
        conversationId: String,
        text: String
    ) async throws -> ConversationMessage {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"text\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(text)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let data = try await requestData(
            path: "/api/orgs/\(organizationSlug)/conversations/\(conversationId)/messages",
            method: "POST",
            headers: ["Content-Type": "multipart/form-data; boundary=\(boundary)"],
            body: body
        )
        return try decode(CreateMessageResponse.self, from: data).message
    }

    func streamChat(
        organizationSlug: String,
        conversationId: String,
        userMessageId: String,
        userText: String,
        onEvent: @Sendable (String) -> Void
    ) async throws {
        let url = baseURL.appending(
            path: "/api/orgs/\(organizationSlug)/conversations/\(conversationId)/chat"
        )
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applySessionCookie(to: &request)

        let payload: [String: Any] = [
            "id": conversationId,
            "trigger": "submit-message",
            "messages": [
                [
                    "id": userMessageId,
                    "role": "user",
                    "parts": [["type": "text", "text": userText]],
                ],
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if http.statusCode == 401 {
            throw APIClientError.unauthorized
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            var errorBody = ""
            for try await line in bytes.lines {
                errorBody += line
                if errorBody.count > 2_000 { break }
            }
            throw APIClientError.http(status: http.statusCode, body: errorBody)
        }

        var dataBuffer = ""
        for try await line in bytes.lines {
            if line.hasPrefix("data:") {
                let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if payload == "[DONE]" { break }
                if !dataBuffer.isEmpty { dataBuffer += "\n" }
                dataBuffer += payload
                continue
            }
            if line.isEmpty, !dataBuffer.isEmpty {
                onEvent(dataBuffer)
                dataBuffer = ""
            }
        }
        if !dataBuffer.isEmpty {
            onEvent(dataBuffer)
        }
    }

    private func requestData(
        path: String,
        method: String,
        headers: [String: String] = [:],
        body: Data? = nil
    ) async throws -> Data {
        let url = baseURL.appending(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        applySessionCookie(to: &request)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if http.statusCode == 401 {
            throw APIClientError.unauthorized
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let bodyText = String(data: data, encoding: .utf8) ?? ""
            throw APIClientError.http(status: http.statusCode, body: bodyText)
        }
        return data
    }

    private func applySessionCookie(to request: inout URLRequest) {
        if let sealedSession {
            request.setValue("wos-session=\(sealedSession)", forHTTPHeaderField: "Cookie")
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIClientError.decoding(error)
        }
    }
}
