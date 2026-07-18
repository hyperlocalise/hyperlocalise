import XCTest
@testable import Hyperlocalise

final class PKCETests: XCTestCase {
    func testGeneratePairUsesURLSafeCharactersAndChallenge() {
        let pair = PKCE.generatePair()

        XCTAssertGreaterThanOrEqual(pair.verifier.count, 43)
        XCTAssertLessThanOrEqual(pair.verifier.count, 128)
        XCTAssertFalse(pair.verifier.contains("+"))
        XCTAssertFalse(pair.verifier.contains("/"))
        XCTAssertFalse(pair.verifier.contains("="))
        XCTAssertFalse(pair.challenge.isEmpty)
        XCTAssertNotEqual(pair.verifier, pair.challenge)
    }

    func testRedirectURIMatchesServerAllowlistDefault() {
        XCTAssertEqual(PKCE.redirectURI, "hyperlocalise://auth/callback")
    }
}
