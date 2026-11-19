import SwiftUI

struct APICompletionProgress {
    let job:APIValue
    var percent:Int?{job["completionPercent"].isNull ? nil : job["completionPercent"].int}
    var target:Int{job["completionTargetPoints"].isNull ? 20 : job["completionTargetPoints"].int}
    var delta:Int?{guard let percent,!job["completionBaselinePercent"].isNull else{return nil};return percent-job["completionBaselinePercent"].int}
    var slow:Bool{guard let percent,let delta else{return false};return percent<100 && delta<target}
    var label:String{
        guard let percent else{return "Odhad zatím nezadaný"}
        if percent==100{return "Odhad 100 %"}
        guard let delta else{return "První den s odhadem"}
        if delta<0{return "Odhad snížen o \(-delta) p. b."}
        return (slow ? "Malý posun · " : "Posun ")+"+\(delta) p. b."
    }
}

struct APIJobCompletionSummary:View {
    let job:APIValue
    var compact=false
    private var progress:APICompletionProgress{APICompletionProgress(job:job)}
    private var tint:Color{progress.slow ? .red : progress.delta != nil || progress.percent==100 ? .green : DiaryStyle.accent}
    var body:some View{VStack(alignment:.leading,spacing:8){
        HStack{Text("Odhad dokončení").font(compact ? .caption : .subheadline);Spacer();Text(progress.percent.map{"\($0) %"} ?? "Nezadán").font(compact ? .headline : .title2.bold()).monospacedDigit().foregroundStyle(tint)}
        if let percent=progress.percent{ProgressView(value:Double(percent),total:100).tint(tint).accessibilityLabel("Odhad dokončení").accessibilityValue("\(percent) procent")}
        if progress.percent != nil{Label(progress.label,systemImage:progress.slow ? "exclamationmark.circle" : progress.delta != nil || progress.percent==100 ? "checkmark.circle" : "clock").font(.caption.weight(.semibold)).foregroundStyle(tint)}
        if !job["completionBaselineDay"].string.isEmpty{Text("Od "+job["completionBaselineDay"].string+" · hranice \(progress.target) p. b.").font(.caption).foregroundStyle(.secondary)}
        if !job["completionUpdatedName"].string.isEmpty{Text(job["completionUpdatedName"].string+" · "+APIFormat.date(job["completionUpdatedAt"])).font(.caption).foregroundStyle(.secondary)}
        if !job["completionNote"].string.isEmpty{Text(compact ? String(job["completionNote"].string.prefix(160)) : job["completionNote"].string).font(.caption).fixedSize(horizontal:false,vertical:true)}
    }}
}

struct APIJobCompletionCard:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    @State private var editing=false
    @State private var target=false
    var body:some View{
        let current=store.currentJob(job)
        APIJobCompletionCompactContent(job:current,canEdit:store.writer && !store.isRolePreview,canSetTarget:store.manager && !store.isRolePreview,edit:{editing=true},setTarget:{target=true})
            .sheet(isPresented:$editing){APIJobCompletionEditor(store:store,job:current,isTarget:false)}
            .sheet(isPresented:$target){APIJobCompletionEditor(store:store,job:current,isTarget:true)}
    }
}

struct APIJobCompletionCompactContent:View {
    let job:APIValue
    let canEdit:Bool
    let canSetTarget:Bool
    let edit:()->Void
    let setTarget:()->Void
    private var progress:APICompletionProgress{APICompletionProgress(job:job)}
    private var tint:Color{progress.slow ? DiaryStyle.warning : DiaryStyle.accent}
    var body:some View {
        VStack(alignment:.leading,spacing:9){
            HStack(alignment:.center,spacing:8){
                Text("Dokončení zakázky").font(.subheadline.weight(.semibold))
                Spacer(minLength:4)
                Text(progress.percent.map{"\($0) %"} ?? "—").font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(tint)
                if canEdit{Button(action:edit){Image(systemName:"pencil")}.diaryBubble(.icon).accessibilityLabel("Upravit odhad")}
            }
            if let percent=progress.percent {
                ProgressView(value:Double(percent),total:100).tint(tint).accessibilityLabel("Odhad dokončení").accessibilityValue("\(percent) procent")
            }else{Text("Odhad zatím nezadaný").font(.caption).foregroundStyle(.secondary)}
            HStack(alignment:.top,spacing:8){
                VStack(alignment:.leading,spacing:3){
                    if !job["completionUpdatedAt"].isNull {
                        Text(APIFormat.date(job["completionUpdatedAt"])+(job["completionUpdatedName"].string.isEmpty ? "" : " · "+job["completionUpdatedName"].string)).font(.caption).foregroundStyle(.secondary)
                    }
                    if progress.delta != nil{Label(progress.label,systemImage:progress.slow ? "exclamationmark.circle" : "checkmark.circle").font(.caption).foregroundStyle(tint)}
                    if !job["completionNote"].string.isEmpty{Text(job["completionNote"].string).font(.caption).foregroundStyle(.secondary).lineLimit(2)}
                }
                Spacer(minLength:0)
                if canSetTarget {
                    Menu{Button("Nastavit hranici posunu · \(progress.target) p. b.",action:setTarget)}label:{Image(systemName:"ellipsis").frame(minWidth:44,minHeight:44)}
                        .buttonStyle(.plain).accessibilityLabel("Nastavení dokončení zakázky")
                }
            }
        }.padding(14).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20))
            .contextMenu{if canSetTarget{Button("Nastavit hranici posunu",action:setTarget)}}
    }
}

struct APIJobCompletionEditor:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let isTarget:Bool
    @Environment(\.dismiss) private var dismiss
    @State private var percent=0.0
    @State private var points=20
    @State private var note=""
    @State private var version=0
    @State private var operation=UUID().uuidString
    @State private var lastInput:APIValue = .null
    @State private var fresh:APIValue = .null
    @State private var confirmed=false
    @State private var problem:String?
    @State private var busy=false
    @State private var loaded=false
    private var key:String{"job-completion:"+job.id+(isTarget ? ":target" : "")}
    var body:some View{NavigationStack{Form{
        Section(job.title){
            if isTarget{
                Stepper("Minimum: \(points) procentních bodů",value:$points,in:1...100)
                Text("Porovnává poslední dva dny s odhadem. Dny bez zápisu automaticky nehodnotí.").font(.footnote)
            }else{
                HStack{Text("Kolik je hotovo?");Spacer();Text("\(Int(percent)) %").font(.title2.bold()).monospacedDigit()}
                Slider(value:$percent,in:0...100,step:1).accessibilityLabel("Odhad dokončení v procentech")
                TextField("Poznámka k postupu (nepovinné)",text:$note,axis:.vertical).lineLimit(2...5)
                Text("100 % samo nezmění stav zakázky na Hotovo.").font(.footnote)
            }
        }
        if !fresh.isNull{Section("Mezitím uložený údaj"){
            Text(isTarget ? "Aktuální hranice: \(fresh["completionTargetPoints"].int) p. b." : "Aktuální odhad: \(fresh["completionPercent"].int) % · "+fresh["completionUpdatedName"].string)
            Toggle("Chci uložit svůj údaj místo tohoto",isOn:$confirmed)
        }}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
        if !store.online{Text("Uložení vyžaduje připojení. Rozepsané údaje zůstanou v telefonu.").font(.footnote)}
        Button(isTarget ? "Uložit hranici" : "Uložit odhad"){Task{await save()}}.diaryBubble(.primary).disabled(busy || !fresh.isNull && !confirmed)
    }.navigationTitle(isTarget ? "Hranice posunu" : "Dokončení zakázky").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){persist();dismiss()}.disabled(busy)}}}.editLease(store).interactiveDismissDisabled(busy)
        .onAppear{restore()}.onChange(of:percent){_,_ in persist()}.onChange(of:points){_,_ in persist()}.onChange(of:note){_,_ in persist()}
    }
    private var value:APIValue{isTarget ? .object(["points":.n(points),"version":.n(version)]) : .object(["percent":.n(Int(percent)),"note":.s(note),"version":.n(version)])}
    private func restore(){
        let initialVersion=job[isTarget ? "completionTargetVersion" : "completionVersion"].int
        let fallback:APIValue=isTarget ? .object(["points":.n(APICompletionProgress(job:job).target),"version":.n(initialVersion)]) : .object(["percent":.n(job["completionPercent"].int),"note":.s(job["completionDay"].string==store.today ? job["completionNote"].string : ""),"version":.n(initialVersion)])
        let draft=store.draft(key,fallback:fallback);version=draft.baseVersion;operation=draft.operationID
        lastInput=draft.value.selecting(isTarget ? ["points","version"] : ["percent","note","version"]);percent=Double(draft.value["percent"].int);points=draft.value["points"].isNull ? 20 : draft.value["points"].int;note=draft.value["note"].string;loaded=true
    }
    private func persist(){guard loaded,!busy else{return};if value != lastInput{operation=UUID().uuidString;lastInput=value};store.saveDraft(key,draft:APIDraft(value:value,baseVersion:version,operationID:operation,updatedAt:Date()))}
    private func save()async{
        guard !busy else{return};persist();guard store.online else{problem="Připojte se pro uložení. Rozepsané údaje zůstaly v telefonu.";return}
        guard !isTarget || store.manager else{problem="Hranici nastavuje správce.";return}
        busy=true;defer{busy=false}
        do{
            var input=value;if !fresh.isNull{input["version"]=fresh[isTarget ? "completionTargetVersion" : "completionVersion"]}
            if input != lastInput{operation=UUID().uuidString;lastInput=input};store.saveDraft(key,draft:APIDraft(value:input,baseVersion:input["version"].int,operationID:operation,updatedAt:Date()));input["operationId"] = .s(operation)
            _ = try await store.write("/api/jobs/"+job.id+(isTarget ? "/completion-target" : "/completion"),method:"PATCH",body:input)
            store.removeDraft(key);dismiss()
        }catch{problem=error.localizedDescription;if let e=error as? APIError,e.status==409{do{let response=try await store.get("/api/jobs/"+job.id,refresh:true);fresh=response["job"];confirmed=false}catch{}}}
    }
}
