import XCTest
@testable import Hyperlocalise

final class ChatStreamParserTests: XCTestCase {
    func testAppliesTextDeltaChunks() {
        var text = ""
        XCTAssertTrue(
            ChatStreamParser.apply(
                eventJSON: #"{"type":"text-delta","delta":"Hello"}"#,
                to: &text
            )
        )
        XCTAssertTrue(
            ChatStreamParser.apply(
                eventJSON: #"{"type":"text-delta","delta":" world"}"#,
                to: &text
            )
        )
        XCTAssertEqual(text, "Hello world")
    }

    func testExtractsAssistantSnapshotParts() {
        let payload = """
        {"role":"assistant","parts":[{"type":"text","text":"Found the CTA copy."}]}
        """
        XCTAssertEqual(
            ChatStreamParser.extractAssistantText(from: payload),
            "Found the CTA copy."
        )
    }
}
