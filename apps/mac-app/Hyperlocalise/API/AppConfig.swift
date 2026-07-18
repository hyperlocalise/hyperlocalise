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
