import SwiftUI
import UIKit

struct NativeField: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    @State private var value = ""
    @State private var checked = false
    @State private var dateEditor = false
    @State private var selectedDate = Date()
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if control.kind == "toggle" {
                if control.fieldType == "radio" {
                    Button { checked = true; store.change(control, checked: true, commit: true) } label: {
                        Label(control.label, systemImage: checked ? "largecircle.fill.circle" : "circle").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                } else { Toggle(control.label, isOn: Binding(get: { checked }, set: { checked = $0; store.change(control, checked: $0, commit: true) })).tint(DiaryStyle.accent) }
            } else if control.kind == "select" {
                if control.multiple == true {
                    DisclosureGroup(control.label) {
                        ForEach(control.options ?? []) { option in
                            Toggle(option.text, isOn: Binding(get: { value.split(separator: "\n").contains(Substring(option.id)) }, set: { selected in
                                var values = Set(value.split(separator: "\n").map(String.init)); if selected { values.insert(option.id) } else { values.remove(option.id) }
                                value = values.sorted().joined(separator: "\n"); store.change(control, values: values.sorted(), commit: true)
                            })).disabled(option.disabled == true)
                        }
                    }
                } else {
                    Picker(control.label, selection: Binding(get: { value }, set: { value = $0; store.change(control, value: $0, commit: true) })) {
                        if !(control.options ?? []).contains(where: { $0.id == value }) { Text(value.isEmpty ? "Nevybráno" : value).tag(value) }
                        ForEach(control.options ?? []) { option in Text(option.text).tag(option.id).disabled(option.disabled == true) }
                    }.pickerStyle(.menu).frame(minHeight: 44)
                }
            } else {
                Text(control.label + (control.required == true ? " *" : "")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                if control.secure == true {
                    SecureField(control.label, text: input).textInputAutocapitalization(.never).autocorrectionDisabled().textContentType(contentType ?? .password).focused($focused).frame(minHeight: 44)
                        .accessibilityIdentifier("native-field-" + control.id)
                } else if control.fieldType == "textarea" {
                    TextEditor(text: input).scrollContentBackground(.hidden).frame(minHeight: 115).focused($focused).accessibilityLabel(control.label)
                        .accessibilityIdentifier("native-field-" + control.id)
                } else if ["date", "time", "datetime-local", "month"].contains(control.fieldType ?? "") {
                    HStack(alignment: .center) {
                        Button { selectedDate = formatter().date(from: value) ?? Date(); dateEditor = true } label: {
                            Label(value.isEmpty ? "Vybrat \(control.fieldType == "time" ? "čas" : "datum")" : displayDate, systemImage: control.fieldType == "time" ? "clock" : "calendar")
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }.accessibilityIdentifier("native-field-" + control.id)
                        if !value.isEmpty && control.required != true {
                            Button { value = ""; store.change(control, value: "", commit: true) } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary).frame(width: 44, height: 44) }.accessibilityLabel("Vymazat \(control.label)")
                        }
                    }
                } else {
                    TextField(control.label, text: input, axis: control.fieldType == "search" ? .horizontal : .vertical)
                        .lineLimit(1...3).keyboardType(keyboard).textContentType(contentType).focused($focused).frame(minHeight: 44)
                        .textInputAutocapitalization(neverCapitalize ? .never : .sentences).autocorrectionDisabled(neverCapitalize)
                        .accessibilityIdentifier("native-field-" + control.id)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading).disabled(control.disabled == true)
            .onAppear { sync() }
            .onChange(of: control.value) { _, _ in if !focused && !dateEditor { sync() } }
            .onChange(of: control.checked) { _, next in checked = next ?? false }
            .onChange(of: focused) { _, next in if !next { store.change(control, value: value, commit: true) } }
            .sheet(isPresented: $dateEditor) {
                NavigationStack {
                    DatePicker(control.label, selection: $selectedDate, displayedComponents: control.fieldType == "time" ? [.hourAndMinute] : ["date", "month"].contains(control.fieldType ?? "") ? [.date] : [.date, .hourAndMinute])
                        .datePickerStyle(.wheel).labelsHidden().padding().environment(\.locale, Locale(identifier: "cs_CZ")).environment(\.timeZone, TimeZone(identifier: "Europe/Prague")!)
                        .navigationTitle(control.label).navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dateEditor = false } }
                            ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { value = formatter().string(from: selectedDate); store.change(control, value: value, commit: true); dateEditor = false }.fontWeight(.semibold) }
                        }
                }.presentationDetents([.height(340)]).presentationDragIndicator(.visible)
            }
    }
    private var input: Binding<String> { Binding(get: { value }, set: { value = $0; store.change(control, value: $0) }) }
    private var neverCapitalize: Bool { ["email", "url", "search"].contains(control.fieldType ?? "") || control.autocomplete == "username" }
    private var keyboard: UIKeyboardType { ["email": .emailAddress, "tel": .phonePad, "number": .decimalPad, "url": .URL][control.fieldType ?? ""] ?? .default }
    private var contentType: UITextContentType? {
        ["username": .username, "current-password": .password, "new-password": .newPassword, "email": .emailAddress, "tel": .telephoneNumber, "one-time-code": .oneTimeCode][control.autocomplete ?? ""]
    }
    private var displayDate: String {
        guard let date = formatter().date(from: value) else { return value }
        let output = DateFormatter(); output.locale = Locale(identifier: "cs_CZ"); output.timeZone = TimeZone(identifier: "Europe/Prague")
        output.dateStyle = control.fieldType == "time" ? .none : .medium
        output.timeStyle = ["time", "datetime-local"].contains(control.fieldType ?? "") ? .short : .none
        return output.string(from: date)
    }
    private func sync() { value = control.multiple == true ? (control.options ?? []).filter { $0.selected == true }.map(\.id).joined(separator: "\n") : control.value ?? ""; checked = control.checked ?? false }
    private func formatter() -> DateFormatter {
        let format = control.fieldType == "month" ? "yyyy-MM" : control.fieldType == "time" ? "HH:mm" : control.fieldType == "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm"
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(identifier: "Europe/Prague"); formatter.dateFormat = format; return formatter
    }
}
