import SwiftUI

struct APIJobActionBar: View {
    @ObservedObject var store: APIStore
    let job: APIValue
    var snapshot:APIValue = .null
    var showPause=false
    var includeProtocol=true
    @State private var departure = false
    @State private var statusRequest:APIJobStatusRequest?
    @State private var report = false
    @State private var timeAction:APIWorkTimeAction?
    @Environment(\.dynamicTypeSize) private var typeSize
    private var projected:APIValue{APIWorkTimeLogic.project(snapshot,store:store)}
    private var mayWork:Bool{APIJobWorkflow.canWork(job,userID:store.userID,writer:store.writer,manager:store.manager) && !store.isRolePreview}
    private var personal:APIJobDetailAction? {
        guard store.enabled("attendance") else{return nil}
        return APIJobDetailAction.resolve(job:job,states:projected["states"].array,userID:store.userID,travelEnabled:store.enabled("jobTravel"))
    }
    private var canRecord:Bool {
        mayWork && (job["serviceApproval"].isNull || job["serviceApproval"].string=="confirmed") && snapshot["canWrite"].bool && projected["states"].array.contains{$0["userId"].string==store.userID && $0["assigned"].bool}
    }
    var body: some View {
        Group {
            if typeSize.isAccessibilitySize{VStack(spacing:8){actions}}
            else{HStack(spacing:8){actions}}
        }
        .padding(8).frame(maxWidth:600).diaryGlass()
        .padding(.horizontal,12).padding(.top,8).padding(.bottom,6)
        .frame(maxWidth:.infinity)
        .sheet(isPresented:$departure){APIDepartureEditor(store:store,job:job)}
        .sheet(item:$statusRequest){request in APIJobStatusEditor(store:store,job:job,initialStatus:request.targetStatus)}
        .sheet(item:$timeAction){request in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:request.kind,selected:[store.userID])}
        .sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)}
    }
    @ViewBuilder private var actions:some View {
        if let personal,(canRecord || personal == .report) {
            Button {
                if let kind=personal.timeKind{timeAction=APIWorkTimeAction(kind:kind)}else{report=true}
            }label:{Label(personal.title,systemImage:personal.symbol).frame(maxWidth:.infinity).fixedSize(horizontal:false,vertical:true)}
                .diaryBubble(.primary).accessibilityIdentifier("job-primary-action").accessibilityLabel(personal.title)
        }else if !store.enabled("attendance"),mayWork,let legacy=APIJobWorkflow.primary(job,travelEnabled:store.enabled("jobTravel")) {
            // Installations without attendance keep their established global-status workflow.
            Button {
                if legacy == .departure{departure=true}else{statusRequest=APIJobStatusRequest(targetStatus:legacy.targetStatus)}
            }label:{Label(legacy == .complete ? "Dokončit zakázku" : legacy.title,systemImage:legacy.symbol).frame(maxWidth:.infinity)}
                .diaryBubble(.primary).accessibilityIdentifier("job-primary-action")
        }else if store.enabled("attendance"),mayWork,snapshot.isNull {
            Label("Pracovní stav se načítá",systemImage:"clock").font(.footnote).foregroundStyle(.secondary).frame(maxWidth:.infinity,minHeight:44)
        }
        if showPause,canRecord,personal == .stop {
            Button{timeAction=APIWorkTimeAction(kind:"break")}label:{Image(systemName:"pause")}.diaryBubble(.icon).accessibilityLabel("Přerušit práci")
        }
        if includeProtocol,store.enabled("jobs"),personal != .report {
            Button{report=true}label:{Image(systemName:"doc.text").frame(minWidth:28,minHeight:28)}.diaryBubble(.icon).accessibilityLabel("Servisní protokol")
        }
    }
}
