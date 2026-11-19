import SwiftUI

struct APIJobListRow:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    @State private var statusRequest:APIJobStatusRequest?
    @State private var departure=false
    @State private var report=false
    @State private var time=false
    var mayWork:Bool{APIJobWorkflow.canWork(job,userID:store.userID,writer:store.writer,manager:store.manager) && !store.isRolePreview}
    var body:some View{VStack(alignment:.leading,spacing:12){
        NavigationLink{detail}label:{APIRecordRow(entity:.jobs,value:job)}.accessibilityIdentifier("native-job-"+job.id)
        LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:8){
            if let url=APIFormat.navigation(job["address"].string){Link(destination:url){action("Navigovat","location")}}else{NavigationLink{detail}label:{action("Místo návštěvy","mappin")}}
            if mayWork{Button{statusRequest=APIJobStatusRequest(targetStatus:nil)}label:{action("Změnit stav","arrow.triangle.2.circlepath")}}
            if mayWork,let primary=APIJobWorkflow.primary(job,travelEnabled:store.enabled("jobTravel")){Button{if primary == .stopWork{time=true}else if primary == .departure{departure=true}else{statusRequest=APIJobStatusRequest(targetStatus:primary.targetStatus)}}label:{action(primary.title,primary.symbol)}}
            else if mayWork{Button{report=true}label:{action("Servisní protokol","doc.text")}}
            NavigationLink{detail}label:{action("Podrobnosti","chevron.right")}
        }.diaryBubble()
    }.padding(.vertical,6).sheet(item:$statusRequest){request in APIJobStatusEditor(store:store,job:job,initialStatus:request.targetStatus)}.sheet(isPresented:$departure){APIDepartureEditor(store:store,job:job)}.sheet(isPresented:$time){NavigationStack{APIJobTimeView(store:store,job:job,initialAction:"stop")}}.sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)}}
    private var detail:some View{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}
    private func action(_ title:String,_ symbol:String)->some View{Label(title,systemImage:symbol).font(.subheadline).frame(maxWidth:.infinity,minHeight:44).fixedSize(horizontal:false,vertical:true)}
}
struct APIUpcomingVisits:View {
    @ObservedObject var store:APIStore
    var mine:Bool
    @State private var jobs:[APIValue]=[]
    var body:some View{Group{if !jobs.isEmpty{Text("Nejbližší naplánované návštěvy").font(.headline);ForEach(jobs,id:\.id){job in NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{APIRecordRow(entity:.jobs,value:job)}}}}.task(id:store.scope+String(mine)+store.revision.uuidString){do{let suffix=mine || !store.manager ? "&assignee="+store.userID : "";let result=try await store.get("/api/jobs?state=active&order=schedule&after="+store.today+suffix);jobs=Array(result["jobs"].array.filter{!["done","incomplete"].contains($0["status"].string)}.prefix(3))}catch{jobs=[]}}}
}
