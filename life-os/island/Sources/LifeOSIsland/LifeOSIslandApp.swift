import AppKit
import SwiftUI

@main
struct LifeOSIslandApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var islandController: IslandController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = IslandController()
        islandController = controller
        controller.showCompact()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        islandController?.toggle()
        return true
    }
}

final class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class IslandPresentation: ObservableObject {
    @Published var isExpanded = false
    @Published var isAttachedToNotch = false
    @Published var maskedTopInset: CGFloat = 0
}

@MainActor
final class IslandController: NSObject {
    private enum Mode {
        case compact
        case expanded
    }

    private let actionsStore = ActionsStore()
    private let presentation = IslandPresentation()
    private let panel: IslandPanel
    private var mode: Mode = .compact
    private var localEventMonitor: Any?
    private var collapseWorkItem: DispatchWorkItem?

    private let compactSize = NSSize(width: 224, height: 34)
    private let expandedSize = NSSize(width: 368, height: 54)

    override init() {
        panel = IslandPanel(
            contentRect: NSRect(origin: .zero, size: compactSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        super.init()

        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        // The compact island is ambient UI: it must remain visible while another
        // application (for example, the browser or Codex) owns keyboard focus.
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.animationBehavior = .utilityWindow

        panel.contentView = NSHostingView(
            rootView: IslandView(
                actionsStore: actionsStore,
                presentation: presentation,
                onExpand: { [weak self] in self?.showExpanded() },
                onClose: { [weak self] in self?.showCompact() },
                onExpandedHoverChanged: { [weak self] isHovering in
                    self?.handleExpandedHover(isHovering)
                }
            )
        )

        localEventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard event.keyCode == 53 else { return event } // Escape
            self?.showCompact()
            return nil
        }
    }

    func toggle() {
        mode == .compact ? showExpanded() : showCompact()
    }

    func showCompact() {
        collapseWorkItem?.cancel()
        mode = .compact
        presentation.isExpanded = false
        resize(to: compactSize)
        panel.orderFrontRegardless()
    }

    private func showExpanded() {
        collapseWorkItem?.cancel()
        mode = .expanded
        presentation.isExpanded = true
        resize(to: expandedSize)
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func handleExpandedHover(_ isHovering: Bool) {
        guard mode == .expanded else { return }
        collapseWorkItem?.cancel()
        guard !isHovering else { return }

        let workItem = DispatchWorkItem { [weak self] in
            self?.showCompact()
        }
        collapseWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: workItem)
    }

    private func resize(to size: NSSize) {
        guard let screen = NSScreen.main ?? NSScreen.screens.first else { return }
        let frame = screen.frame
        // auxiliaryTop* may be nil for a regular app window even on a notched
        // display. The safe-area top inset remains the dependable public signal.
        let hasNotch = screen.safeAreaInsets.top > 0.5
        presentation.isAttachedToNotch = hasNotch
        presentation.maskedTopInset = hasNotch ? screen.safeAreaInsets.top : 0

        var effectiveSize = size
        if mode == .expanded {
            // Reserve the camera-housing height inside the window so controls
            // start below its clipped area instead of disappearing behind it.
            effectiveSize.height += presentation.maskedTopInset
        }

        let topEdge: CGFloat
        if hasNotch {
            // Start at the physical top edge. The camera housing masks the
            // non-display part, while the lower curve remains in the menu bar.
            // This is the closest public-API equivalent to a Dynamic Island.
            topEdge = frame.maxY
        } else {
            // An external display has no physical frame to continue, so keep a small
            // breathing gap below the system menu bar instead.
            topEdge = screen.visibleFrame.maxY - 6
        }
        let origin = NSPoint(
            x: frame.midX - effectiveSize.width / 2,
            y: topEdge - effectiveSize.height
        )
        let destination = NSRect(origin: origin, size: effectiveSize)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.22
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(destination, display: true)
        }
    }
}
