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

enum AppConfig {
    static var apiBaseURL: URL {
        if let env = ProcessInfo.processInfo.environment["HYPERLOCALISE_API_BASE_URL"],
           let url = URL(string: env),
           !env.isEmpty
        {
            return url
        }
        if let plist = Bundle.main.object(forInfoDictionaryKey: "HYPERLOCALISE_API_BASE_URL") as? String,
           let url = URL(string: plist),
           !plist.isEmpty
        {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }
}
