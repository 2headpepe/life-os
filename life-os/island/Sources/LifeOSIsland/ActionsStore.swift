import AppKit
import Foundation

struct IslandConfiguration: Codable {
    var actions: [IslandAction]
}

struct IslandAction: Codable, Identifiable, Hashable {
    enum Kind: String, Codable {
        case url
        case command
    }

    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let kind: Kind
    let value: String
}

@MainActor
final class ActionsStore: ObservableObject {
    @Published private(set) var actions: [IslandAction] = []
    @Published private(set) var errorMessage: String?

    private let fileManager = FileManager.default
    private let configURL: URL

    init() {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LifeOSIsland", isDirectory: true)
        configURL = appSupport.appendingPathComponent("actions.json")
        load()
    }

    var configLocation: String { configURL.path }

    func load() {
        do {
            try ensureInitialConfig()
            let data = try Data(contentsOf: configURL)
            actions = try JSONDecoder().decode(IslandConfiguration.self, from: data).actions
            errorMessage = nil
        } catch {
            actions = []
            errorMessage = "Could not load actions.json: \(error.localizedDescription)"
        }
    }

    func openConfig() {
        NSWorkspace.shared.activateFileViewerSelecting([configURL])
    }

    func perform(_ action: IslandAction) {
        switch action.kind {
        case .url:
            guard let url = URL(string: action.value) else {
                errorMessage = "Invalid URL in \(action.title)"
                return
            }
            NSWorkspace.shared.open(url)
        case .command:
            // Commands are intentionally local and user-configured. Review actions.json before adding one.
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.arguments = ["-lc", action.value]
            do {
                try process.run()
            } catch {
                errorMessage = "Could not run \(action.title): \(error.localizedDescription)"
            }
        }
    }

    private func ensureInitialConfig() throws {
        let directory = configURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        guard !fileManager.fileExists(atPath: configURL.path) else { return }
        guard let template = Bundle.module.url(forResource: "actions.example", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        try fileManager.copyItem(at: template, to: configURL)
    }
}
