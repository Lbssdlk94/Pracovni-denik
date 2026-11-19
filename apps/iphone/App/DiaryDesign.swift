import SwiftUI

// Content stays opaque and legible. Glass is reserved for navigation and actions.
enum DiaryStyle {
    static let accent = Color("DiaryAccent")
    static let background = Color(.systemGroupedBackground)
    static let soft = Color("DiarySoft")
    static let actionFill = Color("DiaryActionFill")
    static let warning = Color("DiaryWarning")
    static let surface = Color(.secondarySystemGroupedBackground)
}

enum DiaryBubbleKind: Equatable {
    case secondary, primary, icon, thumbnail
}

// One iPhone control style, including inherited form, sheet and navigation actions.
// Apply the surface to the background only: large text and photos must not be clipped.
struct DiaryBubbleButtonStyle: ButtonStyle {
    var kind: DiaryBubbleKind = .secondary
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        let primary = kind == .primary
        configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.leading)
            .padding(.horizontal, kind == .icon ? 12 : kind == .thumbnail ? 4 : 18)
            .padding(.vertical, kind == .thumbnail ? 4 : 10)
            .frame(minWidth: 44, minHeight: primary ? 50 : 44)
            .foregroundStyle(primary ? Color.white : destructive ? Color.red : DiaryStyle.accent)
            .background {
                DiaryBubbleSurface(kind: kind, destructive: destructive, pressed: configuration.isPressed)
            }
            .contentShape(.interaction, kind == .thumbnail ? AnyShape(RoundedRectangle(cornerRadius: 22)) : kind == .icon ? AnyShape(Circle()) : AnyShape(Capsule()))
            .opacity(isEnabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct DiaryBubbleSurface: View {
    let kind: DiaryBubbleKind
    let destructive: Bool
    let pressed: Bool
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        switch kind {
        case .icon: surface(in: Circle())
        case .thumbnail: surface(in: RoundedRectangle(cornerRadius: 22))
        default: surface(in: Capsule())
        }
    }

    @ViewBuilder private func surface<S: InsettableShape>(in shape: S) -> some View {
        let ink = destructive ? Color.red : DiaryStyle.accent
        Group {
            if kind == .primary {
                shape.fill(DiaryStyle.actionFill)
            } else if reduceTransparency || contrast == .increased {
                shape.fill(DiaryStyle.surface)
            } else if #available(iOS 26.0, *) {
                shape.fill(.clear).glassEffect(.regular, in: shape)
            } else {
                shape.fill(.regularMaterial)
            }
        }
        .overlay(shape.fill((kind == .primary ? Color.white : ink).opacity(pressed ? 0.10 : 0)))
        .overlay(shape.strokeBorder(ink.opacity(contrast == .increased ? 0.7 : kind == .primary ? 0.16 : 0.18), lineWidth: contrast == .increased ? 1.5 : 0.75))
        .shadow(color: Color.black.opacity(reduceTransparency ? 0 : 0.05), radius: 6, x: 0, y: 2)
    }
}

extension View {
    func diaryBubble(_ kind: DiaryBubbleKind = .secondary) -> some View {
        buttonStyle(DiaryBubbleButtonStyle(kind: kind))
    }
}
struct DiaryGlass: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 22))
        } else if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22))
        } else {
            content.background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22))
        }
    }
}
extension View {
    func diaryGlass() -> some View { modifier(DiaryGlass()) }
    func diaryCard() -> some View {
        padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 22))
    }
}
struct DiarySection<Content: View>: View {
    var title: String? = nil
    var symbol: String? = nil
    private let content: Content
    init(title: String? = nil, symbol: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title; self.symbol = symbol; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title {
                HStack(spacing: 8) {
                    if let symbol { Image(systemName: symbol).foregroundStyle(DiaryStyle.accent) }
                    Text(title).font(.headline)
                }
            }
            content
        }.diaryCard()
    }
}
struct DiaryInfoRow: View {
    let title: String
    let value: String
    let symbol: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).font(.body.weight(.medium)).foregroundStyle(DiaryStyle.accent).frame(width: 24).frame(minHeight: 24)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.body).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            }
            Spacer(minLength: 0)
        }.accessibilityElement(children: .combine)
    }
}
struct DiaryActionButton: View {
    let title: String
    let symbol: String
    var prominent = false
    var destructive = false
    var action: () -> Void
    var body: some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol).font(.body.weight(.semibold))
                Text(title).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.diaryBubble(prominent ? .primary : .secondary)
    }
}
struct DiaryStatusBanner: View {
    let text: String
    var symbol = "info.circle"
    var warning = false
    var body: some View {
        Label(text, systemImage: symbol).font(.callout).fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(warning ? DiaryStyle.warning : Color.secondary)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(warning ? Color.orange.opacity(0.1) : DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 16))
    }
}

#if DEBUG
struct DiaryBubbleControls_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            examples.previewLayout(.fixed(width: 390, height: 670)).previewDisplayName("Bubliny · 390 · světlé")
            examples.preferredColorScheme(.dark).previewLayout(.fixed(width: 360, height: 670)).previewDisplayName("Bubliny · 360 · tmavé")
            examples.environment(\.dynamicTypeSize, .accessibility2).previewLayout(.sizeThatFits).previewDisplayName("Bubliny · velký text")
        }
    }
    private static var examples: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Button {} label: { Image(systemName: "chevron.left") }.diaryBubble(.icon).accessibilityLabel("Zpět")
                Spacer()
                Button("Upravit") {}.diaryBubble()
            }
            Text("Pan Petřík").font(.title.bold())
            Button {} label: { Label("Deník realizace", systemImage: "book.closed").frame(maxWidth: .infinity, alignment: .leading) }.diaryBubble()
            Button {} label: { Label("Navigovat", systemImage: "location").frame(maxWidth: .infinity, alignment: .leading) }.diaryBubble()
            DiaryActionButton(title: "Aktualizovat připravenost", symbol: "arrow.triangle.2.circlepath") {}
            Button("Uložit denní zápis") {}.diaryBubble(.primary)
            Button("Probíhá ukládání…") {}.diaryBubble().disabled(true)
            Button("Smazat zápis", role: .destructive) {}.diaryBubble()
            HStack {
                Button {} label: { Label("Hotovo", systemImage: "checkmark") }.diaryBubble(.primary)
                Button {} label: { Label("Protokol", systemImage: "doc.text") }.diaryBubble()
                Button {} label: { Image(systemName: "checkmark") }.diaryBubble(.icon).accessibilityLabel("Změnit stav")
            }
        }.padding(20).background(DiaryStyle.background)
    }
}
#endif
