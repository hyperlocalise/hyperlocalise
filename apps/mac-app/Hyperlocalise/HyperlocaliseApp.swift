import SwiftUI

@main
struct HyperlocaliseApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .frame(minWidth: 960, minHeight: 640)
        }
        .windowStyle(.automatic)
        .defaultSize(width: 1180, height: 760)
        .commands {
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
