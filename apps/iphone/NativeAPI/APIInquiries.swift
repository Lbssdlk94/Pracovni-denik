import SwiftUI

struct APIInquiriesList:View {
    @ObservedObject var store:APIStore
    @State private var rows:[APIValue]=[]
    @State private var members:[APIValue]=[]
    @State private var query=""
    @State private var category=""
    @State private var status=""
    @State private var assignee=""
    @State private var closed=false
    @State private var problem:String?
    @State private var loading=false
    var body:some View {
        Group {
            if !store.manager {
                Text("Poptávky spravuje správce. Pracovník ani čtenář je neuvidí.").padding()
            } else {
                List {
                    Section {
                        TextField("Hledat jméno, telefon, číslo", text:$query)
                        Picker("Kategorie", selection:$category) {
                            Text("Všechny").tag("")
                            Text("Závlaha").tag("irrigation")
                            Text("Garden").tag("garden")
                            Text("Obojí").tag("both")
                        }
                        Picker("Stav", selection:$status) {
                            Text("Otevřené stavy").tag("")
                            Text("Nová").tag("new")
                            Text("Kontaktováno").tag("contacted")
                            Text("Prohlídka").tag("visit_set")
                            Text("Nabídka").tag("quote_prep")
                            Text("Čeká na rozhodnutí").tag("awaiting")
                        }
                        Toggle("Uzavřené", isOn:$closed)
                    }
                    if loading && rows.isEmpty { ProgressView("Načítám poptávky…") }
                    if let problem { Text(problem).foregroundStyle(DiaryStyle.warning) }
                    ForEach(rows, id:\.id) { row in
                        NavigationLink { APIInquiryDetail(store:store, inquiryID:row.id, members:members) } label: {
                            VStack(alignment:.leading, spacing:4) {
                                Text(row["number"].string+" · "+[row["firstName"].string, row["lastName"].string].filter{!$0.isEmpty}.joined(separator:" ")).font(.headline)
                                Text([row["categoryLabel"].string, row["statusLabel"].string, row["city"].string].filter{!$0.isEmpty}.joined(separator:" · ")).font(.subheadline).foregroundStyle(.secondary)
                            }.padding(.vertical, 4)
                        }
                    }
                }
                .refreshable { await load() }
                .task(id:store.scope+query+category+status+assignee+String(closed)+store.revision.uuidString) { await load() }
            }
        }
        .navigationTitle("Poptávky")
    }
    private func load() async {
        guard store.manager else { rows=[]; return }
        loading=true
        defer { loading=false }
        var parts=["/api/inquiries?"]
        if closed { parts.append("closed=1&") }
        if !status.isEmpty { parts.append("status="+status.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed)!+"&") }
        if !category.isEmpty { parts.append("category="+category+"&") }
        if !query.trimmingCharacters(in:.whitespaces).isEmpty { parts.append("q="+query.addingPercentEncoding(withAllowedCharacters:.urlQueryAllowed)!+"&") }
        do {
            let result=try await store.get(parts.joined())
            rows=result["inquiries"].array
            if members.isEmpty {
                let summary=try await store.get("/api/inquiries/summary")
                members=summary["members"].array
            }
            problem=nil
        } catch {
            rows=[]
            problem=error.localizedDescription
        }
    }
}

struct APIInquiryDetail:View {
    @ObservedObject var store:APIStore
    let inquiryID:String
    var members:[APIValue]=[]
    @State private var inquiry:APIValue=.null
    @State private var duplicates:APIValue=.null
    @State private var choices:[String]=[]
    @State private var discipline=""
    @State private var note=""
    @State private var assignee=""
    @State private var problem:String?
    @State private var busy=false
    @State private var file:APIFile?
    var body:some View {
        Group {
            if !store.manager {
                Text("Poptávky spravuje správce.").padding()
            } else if inquiry.isNull {
                ProgressView("Načítám poptávku…")
            } else {
                Form {
                    Section("Poptávka") {
                        labeled("Číslo", inquiry["number"].string)
                        labeled("Stav", inquiry["statusLabel"].string)
                        labeled("Kategorie", inquiry["categoryLabel"].string)
                        labeled("Práce", inquiry["serviceLabel"].string)
                        labeled("Jméno", [inquiry["firstName"].string, inquiry["lastName"].string].filter{!$0.isEmpty}.joined(separator:" "))
                        if !inquiry["company"].string.isEmpty { labeled("Společnost", inquiry["company"].string) }
                        labeled("Telefon", inquiry["phone"].string)
                        labeled("E-mail", inquiry["email"].string)
                        labeled("Adresa", inquiry["address"].string)
                        if !inquiry["preferredDate"].string.isEmpty { labeled("Preferovaný termín", inquiry["preferredDate"].string) }
                        labeled("Popis", inquiry["description"].string)
                        extra("Velikost zahrady", "area")
                        extra("Zdroj vody", "water")
                        extra("Poznámka k zahradě", "gardenNote")
                    }
                    if !inquiry["events"].array.isEmpty {
                        Section("Historie") {
                            ForEach(Array(inquiry["events"].array.enumerated()), id:\.offset) { _, event in
                                VStack(alignment:.leading) {
                                    Text(event["summary"].string).font(.body)
                                    Text(event["actorName"].string).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if !inquiry["photos"].array.isEmpty {
                        Section("Fotografie") {
                            ForEach(inquiry["photos"].array, id:\.id) { photo in
                                Button(photo["name"].string.isEmpty ? "Otevřít fotografii" : photo["name"].string) {
                                    Task { await open(photo) }
                                }
                            }
                        }
                    }
                    Section("Poznámka a odpovědnost") {
                        TextField("Interní poznámka", text:$note, axis:.vertical)
                        Picker("Odpovědná osoba", selection:$assignee) {
                            Text("Nepřiřazeno").tag("")
                            ForEach(members, id:\.id) { Text($0["name"].string).tag($0.id) }
                        }
                        Button("Uložit poznámku a přiřazení") { Task { await patch([:]) } }.disabled(busy || store.isRolePreview)
                    }
                    Section("Stav") {
                        ForEach(["contacted","visit_set","quote_prep","quote_sent","awaiting","accepted","rejected","archived"], id:\.self) { id in
                            Button(label(id)) { Task { await patch(["status":.s(id)]) } }.disabled(busy || inquiry["status"].string=="converted" || store.isRolePreview)
                        }
                    }
                    if inquiry["status"].string != "converted" {
                        Section("Převod na zakázku") {
                            if !choices.isEmpty {
                                Picker("Obor zakázky", selection:$discipline) {
                                    Text("Vyberte obor").tag("")
                                    ForEach(choices, id:\.self) { Text($0=="garden" ? "Garden" : "Závlaha").tag($0) }
                                }
                            } else if !discipline.isEmpty {
                                labeled("Obor zakázky", discipline=="garden" ? "Garden" : "Závlaha")
                            }
                            Button("Převést na zakázku") { Task { await convert() } }.disabled(busy || store.isRolePreview || (!choices.isEmpty && discipline.isEmpty))
                            if !inquiry["jobId"].string.isEmpty { Text("Zakázka už existuje. Druhou nezakládám.") }
                        }
                    } else {
                        Section("Zakázka") { Text("Poptávka je převedená. Opakovaný převod server odmítne.") }
                    }
                    if let problem { Text(problem).foregroundStyle(DiaryStyle.warning) }
                }
            }
        }
        .navigationTitle(inquiry["number"].string.isEmpty ? "Poptávka" : inquiry["number"].string)
        .task { await reload() }
        .sheet(item:$file) { item in
            APIQuickLook(url:item.url).onDisappear { try? FileManager.default.removeItem(at:item.url.deletingLastPathComponent()) }
        }
    }
    private func labeled(_ title:String, _ value:String) -> some View {
        VStack(alignment:.leading, spacing:2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value.isEmpty ? "—" : value).font(.body).textSelection(.enabled)
        }
    }
    @ViewBuilder private func extra(_ title:String, _ key:String) -> some View {
        let value=inquiry["extras"][key].string
        if !value.isEmpty { labeled(title, value) }
    }
    private func label(_ id:String)->String {
        ["contacted":"Zákazník kontaktován","visit_set":"Domluvena prohlídka","quote_prep":"Připravuje se nabídka","quote_sent":"Nabídka odeslána","awaiting":"Čeká na rozhodnutí","accepted":"Přijata","rejected":"Zamítnuta","archived":"Archivovat"][id] ?? id
    }
    private func reload() async {
        guard store.manager else { return }
        do {
            let detail=try await store.get("/api/inquiries/"+inquiryID)
            inquiry=detail["inquiry"]
            duplicates=detail["duplicates"]
            note=inquiry["internalNote"].string
            assignee=inquiry["assigneeId"].string
            let preview=try await store.write("/api/inquiries/"+inquiryID+"/convert", method:"POST", body:.object(["preview":.bool(true)]))
            discipline=preview["discipline"].string
            choices=preview["disciplineChoices"].array.map(\.string)
            problem=nil
        } catch { problem=error.localizedDescription }
    }
    private func patch(_ extra:[String:APIValue]) async {
        guard !busy else { return }
        busy=true
        defer { busy=false }
        do {
            try store.requireLiveRole()
            var body:APIValue=.object(["version":inquiry["version"], "internalNote":.s(note), "assigneeId": assignee.isEmpty ? .null : .s(assignee)])
            for (key,value) in extra { body[key]=value }
            let saved=try await store.write("/api/inquiries/"+inquiryID, method:"PATCH", body:body)
            inquiry=saved["inquiry"].isNull ? inquiry : saved["inquiry"]
            await reload()
        } catch { problem=error.localizedDescription }
    }
    private func convert() async {
        guard !busy else { return }
        busy=true
        defer { busy=false }
        do {
            try store.requireLiveRole()
            if !inquiry["jobId"].string.isEmpty { problem="Z této poptávky už zakázka vznikla."; return }
            let mode = duplicates["customers"].array.count==1 ? "existing" : "new"
            var body:APIValue=.object([
                "version":inquiry["version"],
                "mode":.s(mode),
                "acknowledgeDuplicates":.bool(false),
                "discipline": discipline.isEmpty ? .s("all") : .s(discipline),
                "job":.object(["title":.s(inquiry["serviceLabel"].string+" · "+inquiry["lastName"].string), "assignedTo":.s(store.userID)])
            ])
            if mode=="existing" { body["customerId"]=duplicates["customers"].array.first?["id"] ?? .null }
            let saved=try await store.write("/api/inquiries/"+inquiryID+"/convert", method:"POST", body:body)
            if saved["code"].string=="discipline_required" || saved["error"].string.contains("oběma") {
                choices=saved["choices"].array.map(\.string)
                problem=saved["error"].string
                return
            }
            await reload()
        } catch {
            let text=error.localizedDescription
            problem=text
        }
    }
    private func open(_ photo:APIValue) async {
        do {
            let result=try await store.file("/api/inquiries/"+inquiryID+"/photos/"+photo.id)
            file=APIFile(url:APIImage.temporary(result.data, name:photo["name"].string.isEmpty ? "fotografie.jpg" : photo["name"].string))
        } catch { problem=error.localizedDescription }
    }
}
