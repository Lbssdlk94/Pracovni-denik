import SwiftUI

struct APIJobActionBar: View {
    @ObservedObject var store: APIStore
    let job: APIValue
    @State private var departure = false
    @State private var statusRequest:APIJobStatusRequest?
    @State private var report = false
    @State private var time=false
    private var mayWork: Bool { APIJobWorkflow.canWork(job, userID:store.userID, writer:store.writer, manager:store.manager) && !store.isRolePreview }
    private var primary: APIJobPrimaryAction? { APIJobWorkflow.primary(job, travelEnabled:store.enabled("jobTravel")) }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { actions }
            VStack(spacing: 8) { actions }
        }
        .font(.subheadline.weight(.semibold)).padding(12)
        .frame(maxWidth:.infinity).background(.regularMaterial)
        .sheet(isPresented:$departure) { APIDepartureEditor(store:store,job:job) }
        .sheet(item:$statusRequest) { request in APIJobStatusEditor(store:store,job:job,initialStatus:request.targetStatus) }
        .sheet(isPresented:$time){NavigationStack{APIJobTimeView(store:store,job:job,initialAction:"stop")}}
        .sheet(isPresented:$report) { APIProtocolEditor(store:store,jobID:job.id) }
    }
    @ViewBuilder private var actions: some View {
        if mayWork, let primary {
            Button {
                if primary == .stopWork{time=true}
                else if primary == .departure { departure=true }
                else { statusRequest=APIJobStatusRequest(targetStatus:primary.targetStatus) }
            } label: {
                Label(primary.title,systemImage:primary.symbol).frame(maxWidth:.infinity)
            }.diaryBubble(.primary).accessibilityIdentifier("job-primary-action").accessibilityLabel(primary.title)
        }
        if store.enabled("jobs") {
            Button { report=true } label: {
                Label("Protokol",systemImage:"doc.text").frame(maxWidth:.infinity)
            }.diaryBubble().accessibilityLabel("Servisní protokol")
        }
        if mayWork {
            Button { statusRequest=APIJobStatusRequest(targetStatus:nil) } label: {
                Image(systemName:"checkmark")
            }.diaryBubble(.icon).accessibilityLabel("Změnit stav")
        }
    }
}
