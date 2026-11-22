import SwiftUI
import UIKit

struct APIAssistantWorkspace: View {
    @ObservedObject var store: APIStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var size
    @State private var messages: [APIAssistantMessage] = []
    @State private var draft = ""
    @State private var concept: APIValue = .null
    @State private var confirmID = ""
    @State private var context: APIValue = .null
    @State private var tab = "chat"
    @State private var busy = false
    @State private var notice = ""
    private var wide: Bool { size == .regular }
    var body: some View {
        NavigationStack {
            Group {
                if wide {
                    HStack(spacing:0) { chat.frame(maxWidth:.infinity); Divider(); result.frame(maxWidth:.infinity) }
                } else if tab == "result" { result } else { chat }
            }
            .background(DiaryStyle.background)
            .navigationTitle("Pracovní asistent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.cancellationAction) { Button { dismiss() } label: { Image(systemName:"xmark") }.accessibilityLabel("Zavřít asistenta") }
                ToolbarItem(placement:.primaryAction) { Button { messages=[]; concept = .null; confirmID=""; draft="" } label: { Image(systemName:"square.and.pencil") }.accessibilityLabel("Nový chat") }
            }
            .safeAreaInset(edge:.bottom) { if !wide { Picker("Panel", selection:$tab) { Text("Asistent").tag("chat"); Text("Výsledek").tag("result") }.pickerStyle(.segmented).padding(8).background(.regularMaterial) } }
        }
    }
    private var chat: some View {
        VStack(spacing:0) {
            ScrollView {
                LazyVStack(alignment:.leading, spacing:12) {
                    ForEach(messages) { message in
                        Text(message.text).frame(maxWidth:.infinity, alignment: message.mine ? .trailing : .leading).padding(10).background(message.mine ? DiaryStyle.soft : Color.clear, in:RoundedRectangle(cornerRadius:16))
                    }
                }.padding(16)
            }
            HStack {
                TextField("Příkaz", text:$draft, axis:.vertical).frame(minHeight:44)
                Button { Task { await send() } } label: { Image(systemName: busy ? "stop.fill" : "arrow.up") }.disabled(draft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && !busy).frame(width:44, height:44).accessibilityLabel(busy ? "Zastavit" : "Odeslat")
            }.padding(10)
        }
    }
    private var result: some View {
        ScrollView {
            VStack(alignment:.leading, spacing:12) {
                if concept.isNull { Text("Výsledek příkazu se objeví tady. Zakázka se neuloží bez potvrzení.").foregroundStyle(.secondary) }
                else { conceptForm }
                if !notice.isEmpty { Text(notice).font(.caption).foregroundStyle(DiaryStyle.warning) }
            }.padding(16)
        }
    }
    private var conceptForm: some View {
        VStack(alignment:.leading, spacing:10) {
            HStack { Text("Nová zakázka").font(.headline); Text("Koncept").font(.caption.weight(.bold)).padding(.horizontal,8).padding(.vertical,4).background(DiaryStyle.soft, in:Capsule()) }
            Text(concept["customerName"].string).foregroundStyle(.secondary)
            TextField("Název", text:binding("title")).frame(minHeight:44)
            ForEach(Array(concept["terms"].array.enumerated()), id:\.offset) { index, _ in
                VStack(alignment:.leading) {
                    TextField("Den", text:termBinding(index, "date")).frame(minHeight:44)
                    TextField("Pracovníci", text:peopleBinding(index)).frame(minHeight:44)
                    Button("Odebrat den", role:.destructive) { var rows=concept["terms"].array; if rows.indices.contains(index){rows.remove(at:index); concept["terms"]=.array(rows)} }.frame(minHeight:44)
                }
            }
            Button { var rows=concept["terms"].array; rows.append(.object(["date":.s(""),"start":.s("07:00"),"end":.s("15:00"),"people":.array([]),"note":.s("")])); concept["terms"]=.array(rows) } label: { Label("Přidat den", systemImage:"plus") }.frame(minHeight:44)
            TextField("Poznámky", text:binding("notes"), axis:.vertical).frame(minHeight:44)
            Button("Uložit zakázku") { Task { await confirm() } }.disabled(confirmID.isEmpty || busy).buttonStyle(.borderedProminent).frame(minHeight:44)
            Button("Zrušit koncept") { Task { await cancelConcept() } }.disabled(confirmID.isEmpty || busy).frame(minHeight:44)
        }
    }
    private func binding(_ key:String)->Binding<String> { Binding(get:{concept[key].string}, set:{concept[key] = .s($0)}) }
    private func termBinding(_ index:Int, _ key:String)->Binding<String> { Binding(get:{concept["terms"].array.indices.contains(index) ? concept["terms"].array[index][key].string : ""}, set:{var rows=concept["terms"].array; guard rows.indices.contains(index) else {return}; rows[index][key]=.s($0); concept["terms"]=.array(rows)}) }
    private func peopleBinding(_ index:Int)->Binding<String> { Binding(get:{concept["terms"].array.indices.contains(index) ? concept["terms"].array[index]["people"].array.map(\.string).joined(separator:", ") : ""}, set:{var rows=concept["terms"].array; guard rows.indices.contains(index) else {return}; rows[index]["people"]=.array($0.split(separator:",").map{APIValue.s(String($0).trimmingCharacters(in:.whitespaces))}.filter{!$0.string.isEmpty}); concept["terms"]=.array(rows)}) }
    private func send() async {
        let text = draft.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        messages.append(APIAssistantMessage(text:text, mine:true)); draft=""; busy=true; defer { busy=false }
        do {
            var body: APIValue = .object(["text":.s(text), "mode":.s("basic")])
            if !context.isNull { body["context"] = context }
            let response = try await store.write("/api/assistant", method:"POST", body:body)
            messages.append(APIAssistantMessage(text:response["reply"].string, mine:false))
            if !response["context"].isNull { context = response["context"] }
            if !response["concept"].isNull { concept = response["concept"]; confirmID = response["confirm"]["id"].string; tab = "result"; UIImpactFeedbackGenerator(style:.light).impactOccurred() }
            if !response["confirm"].isNull { confirmID = response["confirm"]["id"].string }
        } catch { notice = error.localizedDescription }
    }
    private func confirm() async {
        guard !confirmID.isEmpty else { return }
        busy=true; defer { busy=false }
        do {
            let response = try await store.write("/api/assistant", method:"POST", body:.object(["confirmId":.s(confirmID), "concept":concept, "mode":.s("basic")]))
            messages.append(APIAssistantMessage(text:response["reply"].string, mine:false))
            if response["mutated"].isNull == false { concept = .null; confirmID = "" }
            tab = "chat"
        } catch { notice = error.localizedDescription }
    }
    private func cancelConcept() async {
        guard !confirmID.isEmpty else { return }
        _ = try? await store.write("/api/assistant", method:"POST", body:.object(["cancelId":.s(confirmID), "mode":.s("basic")]))
        concept = .null; confirmID = ""; messages.append(APIAssistantMessage(text:"Koncept je zrušený. Nic se neuložilo.", mine:false))
    }
}
struct APIAssistantMessage: Identifiable { let id = UUID(); let text: String; let mine: Bool }
