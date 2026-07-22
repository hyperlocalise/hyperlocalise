/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import SwiftUI

enum HLTheme {
    static let brand = Color("AccentColor")
    static let ink = Color(red: 0.07, green: 0.09, blue: 0.11)
    static let mist = Color(red: 0.93, green: 0.95, blue: 0.94)
    static let moss = Color(red: 0.09, green: 0.42, blue: 0.29)
    static let clay = Color(red: 0.72, green: 0.45, blue: 0.22)
    static let fog = Color(red: 0.86, green: 0.89, blue: 0.88)

    static let displayFont = Font.system(.largeTitle, design: .serif).weight(.semibold)
    static let titleFont = Font.system(.title2, design: .default).weight(.semibold)
    static let bodyFont = Font.system(.body, design: .default)
    static let monoFont = Font.system(.body, design: .monospaced)
}

struct AtmosphereBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.94, green: 0.96, blue: 0.95),
                    Color(red: 0.88, green: 0.92, blue: 0.90),
                    Color(red: 0.82, green: 0.88, blue: 0.86),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [
                    HLTheme.moss.opacity(0.16),
                    .clear,
                ],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 420
            )
            RadialGradient(
                colors: [
                    HLTheme.clay.opacity(0.10),
                    .clear,
                ],
                center: .bottomLeading,
                startRadius: 10,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
    }
}
