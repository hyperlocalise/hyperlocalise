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
import SwiftUI

@main
struct HyperlocaliseApp: App {
    @State private var appModel = AppModel()
    private let sparkleUpdater = SparkleUpdater.makeForCurrentBundle()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .frame(minWidth: 960, minHeight: 640)
        }
        .windowStyle(.automatic)
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(after: .appInfo) {
                CheckForUpdatesView(updater: sparkleUpdater.updater)
            }
            CommandGroup(replacing: .newItem) {
                Button("New Conversation") {
                    Task { await appModel.startNewConversation() }
                }
                .keyboardShortcut("n", modifiers: [.command])
                .disabled(!appModel.isAuthenticated)
            }
        }
    }
}
