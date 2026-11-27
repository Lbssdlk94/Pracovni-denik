import SwiftUI

enum APIDuration {
    static let presets: [(Int, String)] = [
        (30, "30 minut"), (60, "1 hodina"), (120, "2 hodiny"), (180, "3 hodiny"),
        (240, "4 hodiny"), (300, "5 hodin"), (360, "6 hodin"), (420, "7 hodin"),
        (480, "8 hodin"), (600, "10 hodin"), (720, "12 hodin")
    ]
    static func czech(_ value: Int, _ one: String, _ few: String, _ many: String) -> String {
        let mod = abs(value) % 100
        let word = (11...14).contains(mod) ? many : (value % 10 == 1 ? one : ((2...4).contains(value % 10) ? few : many))
        return "\(value) \(word)"
    }
    static func label(_ minutes: Int) -> String {
        guard minutes > 0 else { return "" }
        let hours = minutes / 60, mins = minutes % 60
        var parts: [String] = []
        if hours > 0 { parts.append(czech(hours, "hodina", "hodiny", "hodin")) }
        if mins > 0 { parts.append(czech(mins, "minuta", "minuty", "minut")) }
        return parts.joined(separator: " ")
    }
    static func minute(_ value: String) -> Int? {
        let parts = value.split(separator: ":")
        guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]), (0...59).contains(minute) else { return nil }
        if hour == 24 && minute == 0 { return 1440 }
        guard (0...23).contains(hour) else { return nil }
        return hour * 60 + minute
    }
    static func clock(_ minute: Int) -> String { String(format: "%02d:%02d", minute / 60, minute % 60) }
    static func span(_ start: String, _ end: String) -> Int? {
        guard let from = minute(start), let to = minute(end), from < 1440, to > from else { return nil }
        return to - from
    }
    static func fromParts(_ hoursRaw: String, _ minutesRaw: String) -> Int? {
        let hoursText = hoursRaw.trimmingCharacters(in: .whitespaces)
        let minutesText = minutesRaw.trimmingCharacters(in: .whitespaces)
        if hoursText.isEmpty && minutesText.isEmpty { return nil }
        let hours = hoursText.isEmpty ? 0 : Int(hoursText)
        let minutes = minutesText.isEmpty ? 0 : Int(minutesText)
        guard let hours, let minutes, (0...24).contains(hours), (0...59).contains(minutes) else { return nil }
        let total = hours * 60 + minutes
        return (1...1440).contains(total) ? total : nil
    }
    struct Choice { let minutes: Int?; let end: String; let overflow: Bool; let midnight: Bool; let blocked: Bool }
    static func choice(start: String, minutes: Int?, term: Bool) -> Choice {
        guard let minutes, (1...1440).contains(minutes) else { return Choice(minutes: nil, end: "", overflow: false, midnight: false, blocked: false) }
        guard let from = minute(start), from < 1440 else { return Choice(minutes: minutes, end: "", overflow: false, midnight: false, blocked: false) }
        if from + minutes > 1440 { return Choice(minutes: minutes, end: "", overflow: true, midnight: false, blocked: true) }
        let end = clock(from + minutes)
        let midnight = end == "24:00"
        let blocked = term && midnight
        return Choice(minutes: minutes, end: blocked ? "" : end, overflow: false, midnight: midnight, blocked: blocked)
    }
    static func totalLabel(_ terms: [APIValue]) -> String {
        let total = terms.reduce(0) { $0 + (span($1["start"].string, $1["end"].string) ?? 0) }
        return total > 0 ? "Celková plánovaná délka: \(label(total))" : "Celková plánovaná délka: doplňte délku jednotlivých dní"
    }
}

struct APIDurationPicker: View {
    @Binding var minutes: Int?
    var start: String
    var term = false
    var onEnd: (String) -> Void = { _ in }
    @State private var custom = false
    @State private var chosen: Int?
    @State private var hoursText = ""
    @State private var minutesText = ""
    @State private var warning = ""
    @State private var ready = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Plánovaná doba").font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: 8)], spacing: 8) {
                ForEach(APIDuration.presets, id: \.0) { item in
                    chip(item.1, pressed: !custom && chosen == item.0) { select(item.0, customChoice: false) }
                }
                chip("Vlastní délka", pressed: custom) { beginCustom() }
            }
            if custom {
                HStack {
                    TextField("Hodiny", text: $hoursText).keyboardType(.numberPad).frame(minHeight: 44).accessibilityLabel("Hodiny")
                    TextField("Minuty", text: $minutesText).keyboardType(.numberPad).frame(minHeight: 44).accessibilityLabel("Minuty")
                }
            }
            if !warning.isEmpty {
                Text(warning).font(.caption).foregroundStyle(DiaryStyle.warning)
            } else if let end = APIDuration.choice(start: start, minutes: chosen, term: term).end.nilIfEmpty {
                Text("Konec: \(end)").font(.caption.weight(.semibold)).foregroundStyle(DiaryStyle.accent)
            }
        }
        .onAppear { adopt(minutes, fill: true); ready = true }
        .onChange(of: hoursText) { _, _ in if ready && custom { applyCustom() } }
        .onChange(of: minutesText) { _, _ in if ready && custom { applyCustom() } }
        .onChange(of: minutes) { _, new in if new != chosen { adopt(new, fill: true) } }
        .onChange(of: start) { _, newStart in reapply(newStart) }
    }
    private func chip(_ title: String, pressed: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(pressed ? Color(red: 0.08, green: 0.42, blue: 0.23) : Color.primary)
        .background(pressed ? Color(red: 0.91, green: 0.96, blue: 0.93) : Color(.secondarySystemBackground), in: Capsule())
        .overlay(Capsule().stroke(pressed ? Color(red: 0.12, green: 0.48, blue: 0.27) : Color(.separator), lineWidth: 1))
        .accessibilityAddTraits(pressed ? .isSelected : [])
    }
    private func beginCustom() {
        custom = true
        if hoursText.isEmpty && minutesText.isEmpty, let chosen {
            hoursText = String(chosen / 60)
            minutesText = String(chosen % 60)
        }
        applyCustom()
    }
    private func applyCustom() {
        guard let parsed = APIDuration.fromParts(hoursText, minutesText) else {
            warning = ""
            if !term { minutes = nil; chosen = nil }
            return
        }
        select(parsed, customChoice: true)
    }
    private func select(_ value: Int, customChoice: Bool) {
        let outcome = APIDuration.choice(start: start, minutes: value, term: term)
        if outcome.blocked {
            warning = outcome.midnight ? "Půlnoc nelze uložit jako konec dne. Zkraťte dobu nebo posuňte začátek." : "Konec by přesáhl půlnoc. Zkraťte dobu nebo posuňte začátek."
            return
        }
        warning = ""
        custom = customChoice
        chosen = value
        if minutes != value { minutes = value }
        if term && !outcome.end.isEmpty { onEnd(outcome.end) }
    }
    private func adopt(_ value: Int?, fill: Bool) {
        chosen = value
        let preset = value.map { item in APIDuration.presets.contains { $0.0 == item } } ?? true
        if let value, !preset {
            custom = true
            if fill && APIDuration.fromParts(hoursText, minutesText) != value {
                hoursText = String(value / 60)
                minutesText = String(value % 60)
            }
        } else if fill && preset {
            custom = false
        }
    }
    private func reapply(_ newStart: String) {
        guard let chosen else { return }
        let outcome = APIDuration.choice(start: newStart, minutes: chosen, term: term)
        if outcome.blocked {
            warning = outcome.midnight ? "Půlnoc nelze uložit jako konec dne. Zkraťte dobu nebo posuňte začátek." : "Konec by přesáhl půlnoc. Zkraťte dobu nebo posuňte začátek."
            if !term { minutes = nil }
            return
        }
        warning = ""
        if term && !outcome.end.isEmpty { onEnd(outcome.end) }
    }
}

private extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

struct APIJobScheduleSection: View {
    let job: APIValue
    private var terms: [APIValue] { job["terms"].array }
    var body: some View {
        if terms.count > 1 {
            APIJobGroup(title:"Harmonogram realizace") {
                let done = terms.filter{$0["status"].string=="done"}.count
                Text(APIDuration.totalLabel(terms)).font(.subheadline.weight(.semibold))
                Text("\(done) ze \(terms.count) dní dokončeno. Jeden den nezavře celou zakázku.").font(.caption).foregroundStyle(.secondary)
                ForEach(Array(terms.enumerated()), id:\.offset) { _, term in
                    VStack(alignment:.leading, spacing:4) {
                        Text(APIJobDetailPresentation.date(term["date"].string)+" · "+term["start"].string+"–"+term["end"].string).font(.headline)
                        Text(term["status"].string=="done" ? "Dokončeno" : "Naplánováno").font(.caption).foregroundStyle(DiaryStyle.accent)
                        if term["worked"].array.isEmpty {
                            Text(term["workedMs"].int>0 ? "Odpracováno \(hours(term["workedMs"].int))" : "Odpracované hodiny zatím nejsou").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text(term["worked"].array.map{"\($0["name"].string) \(hours($0["ms"].int))"}.joined(separator:", ")).font(.caption).foregroundStyle(.secondary)
                        }
                        if !term["note"].string.isEmpty { Text(term["note"].string).font(.caption) }
                    }.frame(maxWidth:.infinity, alignment:.leading).padding(.vertical, 6)
                }
                Text("Jednotlivé dny se mění v úpravě zakázky. Materiál, fotky a protokol zůstávají u této jedné zakázky.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    private func hours(_ ms:Int)->String { String(format:"%.1f h", Double(ms)/3_600_000).replacingOccurrences(of:".", with:",") }
}

struct APIJobTermsEditor: View {
    @Binding var value: APIValue
    let people: [APIValue]
    var body: some View {
        VStack(alignment:.leading, spacing:12) {
            Picker("Rozsah zakázky", selection:Binding(get:{value["terms"].array.count>1 || value["termMode"].string=="multi"}, set:setMulti)) {
                Text("Jednodenní").tag(false)
                Text("Vícedenní").tag(true)
            }.pickerStyle(.segmented).accessibilityIdentifier("job-term-mode")
            if value["terms"].array.count>0 && (value["terms"].array.count>1 || value["termMode"].string=="multi") {
                if value["terms"].array.count>1 { Text(APIDuration.totalLabel(value["terms"].array)).font(.subheadline.weight(.semibold)).foregroundStyle(DiaryStyle.accent) }
                ForEach(Array(value["terms"].array.enumerated()), id:\.offset) { index, _ in termEditor(index) }
                Button { appendDay() } label:{Label("Přidat den", systemImage:"plus")}.frame(minHeight:44)
                Button("Stejní pracovníci na všechny dny") { copyCrew() }.frame(minHeight:44)
                Text("Uloží se jedna zakázka. Dokončení dne nemění stav celé zakázky.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
    private func setMulti(_ on:Bool) {
        value["termMode"] = .s(on ? "multi" : "single")
        if on && value["terms"].array.isEmpty { value["terms"] = .array([blank(value["dueDate"].string)]) }
        if !on { value["terms"] = .null }
    }
    private func blank(_ date:String)->APIValue {.object(["date":.s(date),"start":.s("07:00"),"end":.s("15:00"),"people":.array([]),"note":.s(""),"status":.s("planned")])}
    private func appendDay() {
        var rows=value["terms"].array
        let last=rows.last?["date"].string ?? value["dueDate"].string
        let next=last.isEmpty ? DiaryDate.iso(Date()) : DiaryDate.iso(DiaryDate.parse(last)?.addingTimeInterval(86400) ?? Date())
        rows.append(blank(next));value["terms"] = .array(rows)
    }
    private func copyCrew() {
        let crew=value["terms"].array.first?["people"] ?? .array([])
        value["terms"] = .array(value["terms"].array.map{var row=$0;row["people"]=crew;return row})
    }
    private func termEditor(_ index:Int)->some View {
        let term=value["terms"].array[index]
        return VStack(alignment:.leading, spacing:8) {
            DatePicker("Den", selection:Binding(get:{DiaryDate.parse(term["date"].string) ?? Date()}, set:{date in update(index){$0["date"] = .s(DiaryDate.iso(date))}}), displayedComponents:.date).environment(\.timeZone, TimeZone(identifier:"Europe/Prague")!)
            TextField("Od", text:Binding(get:{term["start"].string}, set:{text in
                let previous = APIDuration.span(term["start"].string, term["end"].string)
                update(index) { row in
                    row["start"] = .s(text)
                    if let previous {
                        let outcome = APIDuration.choice(start: text, minutes: previous, term: true)
                        if !outcome.blocked && !outcome.end.isEmpty { row["end"] = .s(outcome.end) }
                    }
                }
            })).accessibilityLabel("Čas od").frame(minHeight:44)
            APIDurationPicker(minutes:Binding(get:{APIDuration.span(term["start"].string, term["end"].string)}, set:{newMinutes in
                guard let newMinutes else { return }
                update(index) { row in
                    let outcome = APIDuration.choice(start: row["start"].string, minutes: newMinutes, term: true)
                    if !outcome.blocked && !outcome.end.isEmpty { row["end"] = .s(outcome.end) }
                }
            }), start:term["start"].string, term:true, onEnd:{end in update(index){$0["end"] = .s(end)}})
            TextField("Poznámka", text:Binding(get:{term["note"].string}, set:{text in update(index){$0["note"] = .s(text)}}))
            Picker("Stav dne", selection:Binding(get:{term["status"].string=="done" ? "done" : "planned"}, set:{status in update(index){$0["status"] = .s(status)}})) {
                Text("Naplánováno").tag("planned");Text("Dokončeno").tag("done")
            }
            ForEach(people, id:\.id) { person in
                Toggle(person["name"].string.isEmpty ? person.title : person["name"].string, isOn:Binding(get:{term["people"].array.contains(.s(person.id))}, set:{on in update(index){row in
                    var crew=row["people"].array.filter{$0.string != person.id}
                    if on {crew.append(.s(person.id))}
                    row["people"] = .array(crew)
                }}))
            }
            Button("Odebrat den", role:.destructive) {var rows=value["terms"].array;if rows.indices.contains(index){rows.remove(at:index);value["terms"] = .array(rows)}}.frame(minHeight:44)
        }.padding(.vertical, 8)
    }
    private func update(_ index:Int, _ change:(inout APIValue)->Void) {
        var rows=value["terms"].array
        guard rows.indices.contains(index) else {return}
        change(&rows[index]);value["terms"] = .array(rows)
    }
}
