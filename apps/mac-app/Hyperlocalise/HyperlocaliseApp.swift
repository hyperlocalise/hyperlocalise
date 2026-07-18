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
