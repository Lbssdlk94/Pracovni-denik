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
            }.padding(.horizontal, 15).padding(.vertical, 13).frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                .foregroundStyle(prominent ? Color.white : destructive ? Color.red : DiaryStyle.accent)
                .background(prominent ? DiaryStyle.actionFill : destructive ? Color.red.opacity(0.08) : DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 17))
                .contentShape(RoundedRectangle(cornerRadius: 17))
        }.buttonStyle(.plain)
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
