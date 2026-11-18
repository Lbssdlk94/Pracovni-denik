import SwiftUI

struct APIJobActionBar: View {
    @ObservedObject var store: APIStore
    let job: APIValue
    @State private var departure = false
    @State private var status = false
    @State private var report = false
    @State private var targetStatus: String?
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
        .sheet(isPresented:$status) { APIJobStatusEditor(store:store,job:job,initialStatus:targetStatus) }
        .sheet(isPresented:$report) { APIProtocolEditor(store:store,jobID:job.id) }
    }
    @ViewBuilder private var actions: some View {
        if mayWork, let primary {
            Button {
                if primary == .departure { departure=true }
                else { targetStatus=primary.targetStatus;status=true }
            } label: {
                Label(primary.title,systemImage:primary.symbol).frame(maxWidth:.infinity,minHeight:48)
            }.buttonStyle(.borderedProminent).accessibilityIdentifier("job-primary-action").accessibilityLabel(primary.title)
        }
        if store.enabled("jobs") {
            Button { report=true } label: {
                Label("Protokol",systemImage:"doc.text").frame(maxWidth:.infinity,minHeight:48)
            }.buttonStyle(.bordered).accessibilityLabel("Servisní protokol")
        }
        if mayWork {
            Button { targetStatus=nil;status=true } label: {
                Image(systemName:"checkmark").frame(minWidth:44,minHeight:48)
            }.buttonStyle(.bordered).accessibilityLabel("Změnit stav")
        }
    }
}
