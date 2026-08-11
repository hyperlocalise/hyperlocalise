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
import AuthenticationServices
import Foundation

struct NativeSessionResponse: Decodable, Sendable {
    struct Session: Decodable, Sendable {
        let sealedSession: String
        let cookieName: String
    }

    struct User: Decodable, Sendable {
        let workosUserId: String
        let email: String
        let firstName: String?
        let lastName: String?
        let avatarUrl: String?
    }

    let session: Session
    let user: User
    let organizationId: String?
}

struct NativeAuthorizeResponse: Decodable, Sendable {
    struct Authorization: Decodable, Sendable {
        let url: String
        let redirectUri: String
    }

    let authorization: Authorization
}

enum AuthServiceError: Error, LocalizedError {
    case invalidAPIBaseURL
    case authorizationCancelled
    case missingAuthorizationCode
    case invalidOAuthState
    case invalidAuthorizationURL
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidAPIBaseURL:
            return "API base URL is not configured."
        case .authorizationCancelled:
            return "Sign-in was cancelled."
        case .missingAuthorizationCode:
            return "WorkOS did not return an authorization code."
        case .invalidOAuthState:
            return "Sign-in callback failed state validation."
        case .invalidAuthorizationURL:
            return "WorkOS returned an invalid authorization URL."
        case .server(let message):
            return message
        }
    }
}

@MainActor
final class AuthService: NSObject {
    private let apiBaseURL: URL
    private let session: URLSession
    private var presentationAnchor: ASPresentationAnchor?
    /// Retained for the lifetime of the browser flow; Apple requires a strong
    /// reference so the session is not deallocated before the callback fires.
    private var webAuthSession: ASWebAuthenticationSession?

    init(apiBaseURL: URL, session: URLSession = .shared) {
        self.apiBaseURL = apiBaseURL
        self.session = session
    }

    func restoreSealedSession() -> String? {
        KeychainStore.loadSession()
    }

    func signOut() {
        KeychainStore.deleteSession()
    }

    func signIn(from anchor: ASPresentationAnchor) async throws -> NativeSessionResponse {
        presentationAnchor = anchor
        let pkce = PKCE.generatePair()
        let state = PKCE.generatePair(byteCount: 16).verifier

        let authorizeURL = try await fetchAuthorizationURL(
            codeChallenge: pkce.challenge,
            state: state
        )

        let callbackURL = try await startWebAuthentication(url: authorizeURL)
        let code = try extractCode(from: callbackURL, expectedState: state)
        let token = try await exchangeToken(
            code: code,
            codeVerifier: pkce.verifier
        )
        try KeychainStore.saveSession(token.session.sealedSession)
        return token
    }

    private func fetchAuthorizationURL(codeChallenge: String, state: String) async throws -> URL {
        var components = URLComponents(
            url: apiBaseURL.appending(path: "/api/auth/native/authorize"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "codeChallenge", value: codeChallenge),
            URLQueryItem(name: "codeChallengeMethod", value: "S256"),
            URLQueryItem(name: "redirectUri", value: PKCE.redirectURI),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "screenHint", value: "sign-in"),
        ]
        guard let url = components?.url else {
            throw AuthServiceError.invalidAPIBaseURL
        }

        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw AuthServiceError.server("Unexpected authorize response.")
        }
        guard http.statusCode == 200 else {
            throw AuthServiceError.server(Self.errorMessage(from: data, fallback: "Authorize failed."))
        }
        let decoded = try JSONDecoder().decode(NativeAuthorizeResponse.self, from: data)
        guard let authorizationURL = URL(string: decoded.authorization.url) else {
            throw AuthServiceError.invalidAuthorizationURL
        }
        return authorizationURL
    }

    private func exchangeToken(code: String, codeVerifier: String) async throws -> NativeSessionResponse {
        let url = apiBaseURL.appending(path: "/api/auth/native/token")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "code": code,
            "codeVerifier": codeVerifier,
            "redirectUri": PKCE.redirectURI,
        ])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthServiceError.server("Unexpected token response.")
        }
        guard http.statusCode == 200 else {
            throw AuthServiceError.server(Self.errorMessage(from: data, fallback: "Token exchange failed."))
        }
        return try JSONDecoder().decode(NativeSessionResponse.self, from: data)
    }

    private func startWebAuthentication(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let authSession = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "hyperlocalise"
            ) { [weak self] callbackURL, error in
                self?.webAuthSession = nil
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionError.errorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                    {
                        continuation.resume(throwing: AuthServiceError.authorizationCancelled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: AuthServiceError.missingAuthorizationCode)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            webAuthSession = authSession
            if !authSession.start() {
                webAuthSession = nil
                continuation.resume(throwing: AuthServiceError.server("Unable to start sign-in session."))
            }
        }
    }

    private func extractCode(from url: URL, expectedState: String) throws -> String {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        let returnedState = items?.first(where: { $0.name == "state" })?.value
        guard let returnedState, returnedState == expectedState else {
            throw AuthServiceError.invalidOAuthState
        }
        if let code = items?.first(where: { $0.name == "code" })?.value, !code.isEmpty {
            return code
        }
        throw AuthServiceError.missingAuthorizationCode
    }

    private static func errorMessage(from data: Data, fallback: String) -> String {
        struct Envelope: Decodable { let error: String?; let message: String? }
        if let envelope = try? JSONDecoder().decode(Envelope.self, from: data) {
            return envelope.message ?? envelope.error ?? fallback
        }
        return fallback
    }
}

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        presentationAnchor ?? ASPresentationAnchor()
    }
}
