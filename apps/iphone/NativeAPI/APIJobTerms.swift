import SwiftUI

struct APIJobScheduleSection: View {
    let job: APIValue
    private var terms: [APIValue] { job["terms"].array }
    var body: some View {
        if terms.count > 1 {
            APIJobGroup(title:"Harmonogram realizace") {
                let done = terms.filter{$0["status"].string=="done"}.count
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
        rows.append(blank(next));value["terms"]=.array(rows)
    }
    private func copyCrew() {
        let crew=value["terms"].array.first?["people"] ?? .array([])
        value["terms"] = .array(value["terms"].array.map{var row=$0;row["people"]=crew;return row})
    }
    private func termEditor(_ index:Int)->some View {
        let term=value["terms"].array[index]
        return VStack(alignment:.leading, spacing:8) {
            DatePicker("Den", selection:Binding(get:{DiaryDate.parse(term["date"].string) ?? Date()}, set:{date in update(index){$0["date"]=.s(DiaryDate.iso(date))}}), displayedComponents:.date).environment(\.timeZone, TimeZone(identifier:"Europe/Prague")!)
            TextField("Od", text:Binding(get:{term["start"].string}, set:{text in update(index){$0["start"]=.s(text)}})).accessibilityLabel("Čas od")
            TextField("Do", text:Binding(get:{term["end"].string}, set:{text in update(index){$0["end"]=.s(text)}})).accessibilityLabel("Čas do")
            TextField("Poznámka", text:Binding(get:{term["note"].string}, set:{text in update(index){$0["note"]=.s(text)}}))
            Picker("Stav dne", selection:Binding(get:{term["status"].string=="done" ? "done" : "planned"}, set:{status in update(index){$0["status"]=.s(status)}})) {
                Text("Naplánováno").tag("planned");Text("Dokončeno").tag("done")
            }
            ForEach(people, id:\.id) { person in
                Toggle(person["name"].string.isEmpty ? person.title : person["name"].string, isOn:Binding(get:{term["people"].array.contains(.s(person.id))}, set:{on in update(index){row in
                    var crew=row["people"].array.filter{$0.string != person.id}
                    if on {crew.append(.s(person.id))}
                    row["people"] = .array(crew)
                }}))
            }
            Button("Odebrat den", role:.destructive) {var rows=value["terms"].array;if rows.indices.contains(index){rows.remove(at:index);value["terms"]=.array(rows)}}.frame(minHeight:44)
        }.padding(.vertical, 8)
    }
    private func update(_ index:Int, _ change:(inout APIValue)->Void) {
        var rows=value["terms"].array
        guard rows.indices.contains(index) else {return}
        change(&rows[index]);value["terms"]=.array(rows)
    }
}
