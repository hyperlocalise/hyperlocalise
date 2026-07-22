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
