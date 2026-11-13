import SwiftUI

struct APIJobListRow:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    @State private var status=false
    @State private var departure=false
    @State private var report=false
    var mayWork:Bool{store.writer && (store.manager || job["assignedTos"].array.contains(.s(store.userID)) || job["assignedTo"].string==store.userID)}
    var body:some View{VStack(alignment:.leading,spacing:12){
        NavigationLink{detail}label:{APIRecordRow(entity:.jobs,value:job)}.accessibilityIdentifier("native-job-"+job.id)
        LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:8){
            if let url=APIFormat.navigation(job["address"].string){Link(destination:url){action("Navigovat","location")}}else{NavigationLink{detail}label:{action("Místo návštěvy","mappin")}}
            if mayWork{Button{status=true}label:{action("Změnit stav","arrow.triangle.2.circlepath")}}
            if mayWork && store.enabled("jobTravel") && !["done","incomplete"].contains(job["status"].string){Button{departure=true}label:{action("Jsem na cestě","car")}}
            else if mayWork{Button{report=true}label:{action("Servisní protokol","doc.text")}}
            NavigationLink{detail}label:{action("Podrobnosti","chevron.right")}
        }.buttonStyle(.bordered)
    }.padding(.vertical,6).sheet(isPresented:$status){APIJobStatusEditor(store:store,job:job)}.sheet(isPresented:$departure){APIDepartureEditor(store:store,job:job)}.sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)}}
    private var detail:some View{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}
    private func action(_ title:String,_ symbol:String)->some View{Label(title,systemImage:symbol).font(.subheadline).frame(maxWidth:.infinity,minHeight:44).fixedSize(horizontal:false,vertical:true)}
}
struct APIUpcomingVisits:View {
    @ObservedObject var store:APIStore
    var mine:Bool
    @State private var jobs:[APIValue]=[]
    var body:some View{Group{if !jobs.isEmpty{Text("Nejbližší naplánované návštěvy").font(.headline);ForEach(jobs,id:\.id){job in NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{APIRecordRow(entity:.jobs,value:job)}}}}.task(id:store.scope+String(mine)+store.revision.uuidString){do{let suffix=mine || !store.manager ? "&assignee="+store.userID : "";let result=try await store.get("/api/jobs?state=active&order=schedule&after="+store.today+suffix);jobs=Array(result["jobs"].array.filter{!["done","incomplete"].contains($0["status"].string)}.prefix(3))}catch{jobs=[]}}}
}
