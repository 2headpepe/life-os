import SwiftUI

struct IslandView: View {
    @ObservedObject var actionsStore: ActionsStore
    @ObservedObject var presentation: IslandPresentation
    let onExpand: () -> Void
    let onClose: () -> Void
    let onExpandedHoverChanged: (Bool) -> Void
    @State private var showsGreeting = true
    @State private var greetingVisible = false
    @State private var greetingRun = UUID()

    var body: some View {
        Group {
            if presentation.isExpanded {
                expandedPanel
            } else {
                compactPill
            }
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.82), value: presentation.isExpanded)
        .onChange(of: presentation.isExpanded) { _, isExpanded in
            guard isExpanded else { return }
            let run = UUID()
            greetingRun = run
            showsGreeting = true
            greetingVisible = false
            DispatchQueue.main.async {
                guard greetingRun == run, presentation.isExpanded else { return }
                withAnimation(.spring(response: 0.46, dampingFraction: 0.68)) {
                    greetingVisible = true
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.62) {
                guard greetingRun == run, presentation.isExpanded else { return }
                withAnimation(.easeOut(duration: 0.24)) {
                    greetingVisible = false
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.84) {
                guard greetingRun == run, presentation.isExpanded else { return }
                withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                    showsGreeting = false
                }
            }
        }
    }

    private var compactPill: some View {
        NotchExtensionShape()
            .fill(.clear)
            .contentShape(NotchExtensionShape())
            .onHover { isHovering in
                if isHovering { onExpand() }
            }
            .onTapGesture(perform: onExpand)
        .accessibilityLabel("Open Life OS Island")
    }

    private var expandedPanel: some View {
        ZStack {
            if showsGreeting {
                greeting
            } else {
                shortcutButtons
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .padding(.top, presentation.maskedTopInset)
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(islandBackground)
        .onHover(perform: onExpandedHoverChanged)
        .accessibilityElement(children: .contain)
    }

    private var greeting: some View {
        HStack(spacing: 7) {
            Text("Я люблю Настю")
            Image(systemName: "heart.fill")
                .font(.system(size: 13, weight: .semibold))
        }
        .font(.system(size: 17, weight: .semibold, design: .rounded))
        .foregroundStyle(
            LinearGradient(
                colors: [
                    Color(red: 1.00, green: 0.72, blue: 0.78),
                    Color(red: 0.94, green: 0.57, blue: 0.68),
                    Color(red: 0.82, green: 0.64, blue: 0.96),
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .shadow(color: Color(red: 0.96, green: 0.45, blue: 0.64).opacity(0.38), radius: 12)
        .opacity(greetingVisible ? 1 : 0)
        .scaleEffect(greetingVisible ? 1 : 0.86)
        .offset(y: greetingVisible ? 0 : 5)
        .transition(.opacity)
    }

    private var shortcutButtons: some View {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.lime)
                .frame(width: 30)

            ForEach(Array(actionsStore.actions.prefix(4))) { action in
                Button {
                    actionsStore.perform(action)
                } label: {
                    Image(systemName: action.icon)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(width: 38, height: 38)
                        .background(.white.opacity(0.08), in: Circle())
                }
                .buttonStyle(.plain)
                .help(action.title)
            }

            Button {
                actionsStore.openConfig()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white.opacity(0.56))
                    .frame(width: 32, height: 38)
            }
            .buttonStyle(.plain)
            .help("Edit shortcuts")
        }
    }

    private var islandBackground: some View {
        IslandSurfaceShape(radius: presentation.isExpanded ? 32 : 24)
            .fill(.black)
            .overlay {
                IslandSideAndBottomBorder(radius: presentation.isExpanded ? 32 : 24)
                    .stroke(.white.opacity(0.17), lineWidth: 1)
            }
    }
}

private struct IslandSurfaceShape: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let corner = min(radius, min(rect.width, rect.height) / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - corner))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - corner, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX + corner, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - corner),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.closeSubpath()
        return path
    }
}

private struct IslandSideAndBottomBorder: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let corner = min(radius, min(rect.width, rect.height) / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - corner))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + corner, y: rect.maxY),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - corner, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.maxY - corner),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        return path
    }
}

private struct NotchExtensionShape: Shape {
    func path(in rect: CGRect) -> Path {
        let radius = min(14, rect.height / 2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - radius, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.maxY - radius),
            control: CGPoint(x: rect.minX, y: rect.maxY)
        )
        path.closeSubpath()
        return path
    }
}

private extension ShapeStyle where Self == Color {
    static var lime: Color { Color(red: 0.76, green: 0.96, blue: 0.37) }
}
