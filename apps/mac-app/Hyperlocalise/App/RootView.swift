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

struct RootView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Group {
            if appModel.isBootstrapping {
                ZStack {
                    AtmosphereBackground()
                    ProgressView("Restoring session…")
                        .controlSize(.large)
                }
            } else if appModel.isAuthenticated {
                ChatShellView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: appModel.isAuthenticated)
        .animation(.easeInOut(duration: 0.2), value: appModel.isBootstrapping)
    }
}
