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
