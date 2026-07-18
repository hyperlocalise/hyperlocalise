import Combine
import Sparkle
import SwiftUI

/// Owns the Sparkle 2 updater for the app lifecycle.
@MainActor
final class SparkleUpdater {
    let controller: SPUStandardUpdaterController

    var updater: SPUUpdater { controller.updater }

    init(startingUpdater: Bool = true) {
        controller = SPUStandardUpdaterController(
            startingUpdater: startingUpdater,
            updaterDelegate: nil,
            userDriverDelegate: nil
        )
    }

    /// Starts background checks only when feed URL and public key are configured.
    static func makeForCurrentBundle() -> SparkleUpdater {
        let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String
        let publicKey = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String
        let configured =
            !(feed?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && !(publicKey?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && publicKey != "REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY"
        return SparkleUpdater(startingUpdater: configured)
    }
}

/// Tracks whether Sparkle can run a manual check (disables the menu item while busy).
final class CheckForUpdatesViewModel: ObservableObject {
    @Published var canCheckForUpdates = false
    private var cancellable: AnyCancellable?

    init(updater: SPUUpdater) {
        cancellable = updater.publisher(for: \.canCheckForUpdates)
            .receive(on: RunLoop.main)
            .sink { [weak self] value in
                self?.canCheckForUpdates = value
            }
    }
}

struct CheckForUpdatesView: View {
    @ObservedObject private var viewModel: CheckForUpdatesViewModel
    private let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        viewModel = CheckForUpdatesViewModel(updater: updater)
    }

    var body: some View {
        Button("Check for Updates…") {
            updater.checkForUpdates()
        }
        .disabled(!viewModel.canCheckForUpdates)
    }
}
