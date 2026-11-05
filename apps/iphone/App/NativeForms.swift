import SwiftUI
import UIKit

struct NativeScreenView: View {
    @ObservedObject var store: NativeScreenStore
    var onBack: (() async -> Void)? = nil
    private var base: NativeScreenSnapshot? { store.screen?.modal == true && store.screen?.isInlineDetail != true ? store.baseScreen : store.screen }
    var body: some View {
        NavigationStack {
            NativeScreenContent(screen: base, store: store, modal: base?.isInlineDetail == true)
                .navigationTitle(base?.displayTitle ?? "Pracovní deník").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if base?.isInlineDetail == true, let close = base?.closeControl {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { Task { await store.perform(close) } } label: { Label("Zpět", systemImage: "chevron.left") }
                                .accessibilityIdentifier("native-detail-back").disabled(store.busy)
                        }
                    } else if let onBack {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { Task { await onBack() } } label: { Label("Přehled", systemImage: "chevron.left") }
                                .accessibilityIdentifier("native-screen-back")
                        }
                    }
                }
        }.tint(DiaryStyle.accent)
            .task { for _ in 0..<60 { if store.browser.hasDocument { break }; try? await Task.sleep(for: .milliseconds(200)) }; await store.refresh() }
            .onReceive(store.browser.$nativeSignal) { signal in
                if signal.kind == .invalidated { store.invalidate() }
                Task { await store.refresh() }
            }
            .sheet(isPresented: Binding(get: { store.screen?.modal == true && store.screen?.isInlineDetail != true }, set: { _ in })) {
                if let screen = store.screen, screen.modal == true {
                    NavigationStack {
                        NativeScreenContent(screen: screen, store: store, modal: true)
                            .navigationTitle(screen.displayTitle).navigationBarTitleDisplayMode(.inline)
                            .toolbar {
                                if let close = screen.closeControl {
                                    ToolbarItem(placement: .cancellationAction) {
                                        Button { Task { await store.perform(close) } } label: { Image(systemName: "xmark") }
                                            .accessibilityLabel("Zavřít formulář").accessibilityIdentifier("native-modal-close").disabled(store.busy)
                                    }
                                }
                            }
                    }.tint(DiaryStyle.accent).presentationDragIndicator(.visible)
                        .presentationDetents([.large]).interactiveDismissDisabled()
                }
            }
    }
}
private struct NativeScreenContent: View {
    let screen: NativeScreenSnapshot?
    @ObservedObject var store: NativeScreenStore
    let modal: Bool
    private var omitted: Set<String> {
        Set([screen?.repeatedTitleID, modal ? screen?.closeControl?.id : nil, modal ? screen?.primaryControl?.id : nil].compactMap { $0 })
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let screen {
                    if screen.online == false { DiaryStatusBanner(text: "Offline · zápisy zůstávají v telefonu", symbol: "wifi.slash", warning: true) }
                    NativeControlList(controls: screen.nodes, store: store, omitting: omitted)
                    if let toast = screen.toast, !toast.isEmpty { DiaryStatusBanner(text: toast, symbol: "checkmark.circle") }
                    if screen.busy == true { ProgressView("Načítám…").frame(maxWidth: .infinity) }
                } else { ProgressView("Otevírám deník…").frame(maxWidth: .infinity).padding(.top, 60) }
                if let error = store.error { DiaryStatusBanner(text: error, symbol: "exclamationmark.circle", warning: true) }
            }.padding(18).frame(maxWidth: 760, alignment: .leading).frame(maxWidth: .infinity)
        }.background(DiaryStyle.background).scrollDismissesKeyboard(.interactively)
            .refreshable { await store.flush(); await store.refresh() }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer(); Button("Hotovo") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if modal, let primary = screen?.primaryControl {
                    NativeActionButton(control: primary, store: store)
                        .padding(12).diaryGlass().padding(.horizontal, 14).padding(.vertical, 8)
                }
            }
            // The active form owns its file/PDF sheets; they never compete with the form sheet on the parent.
            .sheet(item: Binding(get: { (store.screen?.modal ?? false) == modal ? store.fileRequest : nil }, set: { if $0 == nil { store.fileRequest = nil } })) { request in NativeFilePanel(request: request, store: store) }
            .sheet(item: Binding(get: { (store.screen?.modal ?? false) == modal ? store.preview : nil }, set: { store.preview = $0 })) { file in NativeDocumentPreview(file: file) }
    }
}
struct NativeControlList: View {
    let controls: [NativeControl]
    @ObservedObject var store: NativeScreenStore
    var omitting: Set<String> = []
    var embedded = false
    var body: some View {
        ForEach(NativePresentation.groups(controls, omitting: omitting)) { group in
            switch group.kind {
            case .fields:
                if embedded { fields(group.controls) } else { fields(group.controls).diaryCard() }
            case .actions: NativeActionGroup(controls: group.controls, store: store, omitting: omitting)
            case .content:
                VStack(alignment: .leading, spacing: 7) { ForEach(group.controls) { NativeControlView(control: $0, store: store, omitting: omitting) } }
            case .container:
                ForEach(group.controls) { NativeControlView(control: $0, store: store, omitting: omitting) }
            }
        }
    }
    private func fields(_ controls: [NativeControl]) -> some View {
        VStack(alignment: .leading, spacing: 15) {
            ForEach(Array(controls.enumerated()), id: \.element.id) { index, control in
                if index > 0 { Divider() }
                NativeField(control: control, store: store)
            }
        }
    }
}
struct NativeControlView: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    var omitting: Set<String> = []
    var body: some View {
        switch control.kind {
        case "heading":
            Text(control.label).font(control.level == 1 ? .title.bold() : .headline).foregroundStyle(.primary).textSelection(.enabled).padding(.top, 4)
        case "text", "caption", "badge":
            Text(control.label).font(control.kind == "caption" || control.tone == "secondary" ? .footnote : .body).foregroundStyle(control.tone == "secondary" ? Color.secondary : Color.primary)
                .fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
        case "alert": DiaryStatusBanner(text: control.label, warning: true)
        case "field", "toggle", "select": NativeField(control: control, store: store)
        case "button", "file", "document": NativeActionButton(control: control, store: store)
        case "destination", "contact": NativeDestinationRow(control: control, store: store)
        case "category": NativeCategory(control: control, store: store, omitting: omitting)
        case "card", "section":
            DiarySection(title: control.kind == "section" && !control.label.isEmpty ? control.label : nil) {
                NativeControlList(controls: control.children ?? [], store: store, omitting: omitting, embedded: true)
            }
        case "form", "toolbar": NativeControlList(controls: control.children ?? [], store: store, omitting: omitting)
        case "actions": NativeActionGroup(controls: control.children ?? [], store: store, omitting: omitting)
        case "disclosure": NativeDisclosure(control: control, store: store, omitting: omitting)
        case "grid": LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7)) {
            ForEach(control.children ?? []) { child in NativeControlView(control: child, store: store, omitting: omitting) }
        }
        case "progress": ProgressView(value: Double(control.value ?? "0") ?? 0).tint(DiaryStyle.accent)
        case "image": NativeAssetImage(handle: control.handle, label: control.label, store: store)
        case "picture", "canvas": NativeDrawingSurface(control: control, store: store)
        case "map": NativeMapSurface(control: control, store: store)
        default: NativeControlList(controls: control.children ?? [], store: store, omitting: omitting)
        }
    }
}
// Presentation groups carry the original opaque handles. They never write
// business data or derive an identity from the displayed name/address.
struct NativeDestinationRow: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    private var call: NativeControl? { control.children?.first(where: { $0.intent == "call" }) }
    private var location: NativeControl? { control.children?.first(where: { $0.intent == "locate" }) }
    var body: some View {
        HStack(spacing: 10) {
            Button { Task { await store.perform(control) } } label: {
                HStack(spacing: 14) {
                    Image(systemName: control.symbol ?? "leaf").font(.title3).frame(width: 42, height: 42)
                        .background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 14))
                    VStack(alignment: .leading, spacing: 5) {
                        Text(control.label).font(.headline).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                        if let subtitle = control.subtitle, !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }.frame(minHeight: 48).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("native-control-" + control.id)
            if let call {
                Button { Task { await store.perform(call) } } label: {
                    Image(systemName: "phone").frame(minWidth: 44, minHeight: 44).background(DiaryStyle.soft, in: Circle())
                }.buttonStyle(.plain).accessibilityLabel("Zavolat: " + control.label)
            } else if let location {
                Button { Task { await store.perform(location) } } label: {
                    Image(systemName: "location.circle").frame(minWidth: 44, minHeight: 44)
                }.buttonStyle(.plain).accessibilityLabel("Upřesnit polohu: " + control.label)
            }
        }.foregroundStyle(DiaryStyle.accent).padding(16).background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 22))
            .disabled(store.busy || control.disabled == true)
    }
}
struct NativeCategory: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    var omitting: Set<String> = []
    @State private var open = false
    private var sectionAction: NativeControl? {
        control.id.hasPrefix("garden-section:") ? control.children?.first(where: { $0.kind == "button" }) : nil
    }
    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            NativeControlList(controls: control.children ?? [], store: store, omitting: omitting.union(Set([sectionAction?.id].compactMap { $0 })), embedded: true).padding(.top, 14)
        } label: {
            Label(control.label, systemImage: control.symbol ?? "folder")
                .font(.headline).frame(minHeight: 44)
        }.tint(DiaryStyle.accent).diaryCard()
            .accessibilityIdentifier("native-category-" + control.id)
            .onChange(of: open) { _, expanded in
                if expanded, let sectionAction { Task { await store.perform(sectionAction) } }
            }
    }
}
struct NativeActionButton: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    var body: some View {
        DiaryActionButton(title: control.label, symbol: control.actionSymbol, prominent: control.primary == true, destructive: control.danger == true) {
            Task { if control.kind == "document" { await store.openAsset(control.handle) } else { await store.perform(control) } }
        }.accessibilityIdentifier("native-control-" + control.id).disabled(control.disabled == true || store.busy).opacity(control.disabled == true || store.busy ? 0.5 : 1)
    }
}
struct NativeActionGroup: View {
    let controls: [NativeControl]
    @ObservedObject var store: NativeScreenStore
    var omitting: Set<String> = []
    @Environment(\.dynamicTypeSize) private var typeSize
    private var visible: [NativeControl] { controls.filter { !omitting.contains($0.id) } }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(visible.filter { $0.primary == true && $0.danger != true }) { NativeActionButton(control: $0, store: store) }
            let secondary = visible.filter { $0.primary != true && $0.danger != true }
            if !secondary.isEmpty {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .top), count: typeSize.isAccessibilitySize || secondary.count == 1 ? 1 : 2), spacing: 10) {
                    ForEach(secondary) { NativeControlView(control: $0, store: store, omitting: omitting) }
                }
            }
            let destructive = visible.filter { $0.danger == true }
            if !destructive.isEmpty {
                DisclosureGroup("Další možnosti") { ForEach(destructive) { NativeActionButton(control: $0, store: store) }.padding(.top, 10) }
                    .font(.subheadline).tint(.secondary).padding(.top, 8)
            }
        }
    }
}
struct NativeDisclosure: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    var omitting: Set<String> = []
    @State private var open = false
    var body: some View {
        DisclosureGroup(control.label, isExpanded: Binding(get: { open }, set: { next in open = next; Task { await store.perform(control, action: "toggle", extra: ["checked": next]) } })) {
            NativeControlList(controls: control.children ?? [], store: store, omitting: omitting, embedded: true).padding(.top, 14)
        }.font(.headline).tint(DiaryStyle.accent).diaryCard().onAppear { open = control.expanded ?? false }
            .onChange(of: control.expanded) { _, next in open = next ?? false }
    }
}
