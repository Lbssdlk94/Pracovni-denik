import SwiftUI
import UIKit

struct NativeScreenView: View {
    @ObservedObject var store: NativeScreenStore
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let screen = store.screen {
                        if screen.online == false { Label("Offline · zápisy zůstávají v telefonu", systemImage: "wifi.slash").font(.callout).foregroundStyle(.orange) }
                        NativeControlList(controls: screen.nodes, store: store)
                        if let toast = screen.toast, !toast.isEmpty { Text(toast).font(.callout).foregroundStyle(DiaryStyle.accent) }
                        if screen.busy == true { ProgressView("Načítám…") }
                    } else { ProgressView("Otevírám deník…") }
                    if let error = store.error { Text(error).font(.callout).foregroundStyle(.red) }
                }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            }.background(DiaryStyle.background).scrollDismissesKeyboard(.interactively)
                .navigationTitle(store.screen?.title ?? "Pracovní deník").navigationBarTitleDisplayMode(.inline)
                .refreshable { await store.flush(); await store.refresh() }
        }.tint(DiaryStyle.accent)
            .task { for _ in 0..<60 { if store.browser.hasDocument { break }; try? await Task.sleep(for: .milliseconds(200)) }; await store.refresh() }
            .onChange(of: store.browser.nativeSignal) { _, signal in
                if signal.kind == .invalidated { store.invalidate() }
                Task { await store.refresh() }
            }
            .sheet(item: $store.fileRequest) { request in NativeFilePanel(request: request, store: store) }
            .sheet(item: $store.preview) { file in NativeDocumentPreview(file: file) }
    }
}
struct NativeControlList: View {
    let controls: [NativeControl]
    @ObservedObject var store: NativeScreenStore
    var body: some View { ForEach(controls) { control in NativeControlView(control: control, store: store) } }
}
struct NativeControlView: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    var body: some View {
        switch control.kind {
        case "heading": Text(control.label).font(control.level == 1 ? .largeTitle.bold() : .title3.bold()).foregroundStyle(DiaryStyle.accent).textSelection(.enabled)
        case "text": Text(control.label).font(.body).textSelection(.enabled)
        case "field", "toggle", "select": NativeField(control: control, store: store)
        case "button", "file":
            Button(role: control.danger == true ? .destructive : nil) { Task { await store.perform(control) } } label: { Text(control.label).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }
                .buttonStyle(.bordered).disabled(control.disabled == true || store.busy)
        case "card": VStack(alignment: .leading, spacing: 12) { NativeControlList(controls: control.children ?? [], store: store) }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(.background, in: RoundedRectangle(cornerRadius: 20))
        case "disclosure": NativeDisclosure(control: control, store: store)
        case "grid": LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7)) { NativeControlList(controls: control.children ?? [], store: store) }
        case "progress": ProgressView(value: Double(control.value ?? "0") ?? 0)
        case "image": NativeAssetImage(handle: control.handle, label: control.label, store: store)
        case "picture", "canvas": NativeDrawingSurface(control: control, store: store)
        case "map": NativeMapSurface(control: control, store: store)
        case "document": Button { Task { await store.openAsset(control.handle) } } label: { Label(control.label, systemImage: "doc.text").frame(minHeight: 44) }.buttonStyle(.bordered)
        default: NativeControlList(controls: control.children ?? [], store: store)
        }
    }
}
struct NativeField: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    @State private var value: String = ""
    @State private var checked = false
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if control.kind == "toggle" {
                if control.fieldType == "radio" { Button { checked = true; store.change(control, checked: true, commit: true) } label: { Label(control.label, systemImage: checked ? "largecircle.fill.circle" : "circle").frame(minHeight: 44) } }
                else { Toggle(control.label, isOn: Binding(get: { checked }, set: { checked = $0; store.change(control, checked: $0, commit: true) })) }
            } else if control.kind == "select" {
                if control.multiple == true {
                    DisclosureGroup(control.label) {
                        ForEach(control.options ?? []) { option in
                            Toggle(option.text, isOn: Binding(get: { value.split(separator: "\n").contains(Substring(option.id)) }, set: { selected in
                                var values = Set(value.split(separator: "\n").map(String.init)); if selected { values.insert(option.id) } else { values.remove(option.id) }; value = values.sorted().joined(separator: "\n"); store.change(control, values: values.sorted(), commit: true)
                            })).disabled(option.disabled == true)
                        }
                    }
                } else {
                    Picker(control.label, selection: Binding(get: { value }, set: { value = $0; store.change(control, value: $0, commit: true) })) { ForEach(control.options ?? []) { option in Text(option.text).tag(option.id).disabled(option.disabled == true) } }
                }
            } else {
                Text(control.label + (control.required == true ? " *" : "")).font(.subheadline.weight(.semibold))
                if control.secure == true { SecureField(control.label, text: input).textContentType(.password).focused($focused).textFieldStyle(.roundedBorder) }
                else if control.fieldType == "textarea" { TextEditor(text: input).frame(minHeight: 110).padding(6).overlay(RoundedRectangle(cornerRadius: 10).stroke(.secondary.opacity(0.2))).focused($focused) }
                else if ["date","time","datetime-local"].contains(control.fieldType ?? "") {
                    DatePicker(control.label, selection: Binding(get: { date(value) }, set: { value = format($0); store.change(control, value: value, commit: true) }), displayedComponents: control.fieldType == "time" ? [.hourAndMinute] : control.fieldType == "date" ? [.date] : [.date,.hourAndMinute]).labelsHidden().environment(\.locale, Locale(identifier: "cs_CZ")).environment(\.timeZone, TimeZone(identifier: "Europe/Prague")!)
                } else { TextField(control.label, text: input).textFieldStyle(.roundedBorder).focused($focused).keyboardType(keyboard).textInputAutocapitalization(control.fieldType == "email" || control.fieldType == "url" ? .never : .sentences) }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).disabled(control.disabled == true)
            .onAppear { sync() }.onChange(of: control.value) { _, _ in if !focused { sync() } }.onChange(of: control.checked) { _, next in checked = next ?? false }
            .onChange(of: focused) { _, next in if !next { store.change(control, value: value, commit: true) } }
    }
    var input: Binding<String> { Binding(get: { value }, set: { value = $0; store.change(control, value: $0) }) }
    var keyboard: UIKeyboardType { ["email":.emailAddress,"tel":.phonePad,"number":.decimalPad,"url":.URL][control.fieldType ?? ""] ?? .default }
    func sync() { value = control.multiple == true ? (control.options ?? []).filter { $0.selected == true }.map(\.id).joined(separator: "\n") : control.value ?? ""; checked = control.checked ?? false }
    var dateFormat: String { control.fieldType == "time" ? "HH:mm" : control.fieldType == "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm" }
    func formatter() -> DateFormatter { let f=DateFormatter(); f.locale=Locale(identifier:"en_US_POSIX"); f.timeZone=TimeZone(identifier:"Europe/Prague"); f.dateFormat=dateFormat; return f }
    func date(_ value: String) -> Date { formatter().date(from: value) ?? Date() }
    func format(_ date: Date) -> String { formatter().string(from: date) }
}

struct NativeDisclosure: View {
 let control: NativeControl
 @ObservedObject var store: NativeScreenStore
 @State private var open = false
 var body: some View {
  DisclosureGroup(control.label,isExpanded:Binding(get:{open},set:{open=$0;let next=$0;Task{await store.perform(control,action:"toggle",extra:["checked":next])}})) { NativeControlList(controls:control.children ?? [],store:store).padding(.vertical,12) }.font(.headline).onAppear{open=control.expanded ?? false}
 }
}
