import SwiftUI

struct APIDashboardSection<Content:View>:View {
    let title:String
    @ViewBuilder let content:Content
    var body:some View{VStack(alignment:.leading,spacing:10){Text(title).font(.title3.weight(.bold)).accessibilityAddTraits(.isHeader);content}.frame(maxWidth:.infinity,alignment:.leading)}
}
struct APIDashboardFreshness:View {
    @ObservedObject var store:APIStore
    let asOf:APIValue
    var body:some View {
        TimelineView(.periodic(from:.now,by:30)){context in
            let stale=context.date.timeIntervalSince1970*1000-asOf.double>90000
            HStack(spacing:6){
                Image(systemName:!store.online ? "wifi.slash" : stale ? "clock.arrow.circlepath" : "arrow.clockwise")
                Text((!store.online ? "Offline · uložený přehled " : stale ? "Uložený přehled z " : "Aktualizováno ")+APIAttendanceView.time(asOf))
                if !store.outbox.isEmpty{Text("· neodesláno: \(store.outbox.count)")}
            }.font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
        }
    }
}
struct APIDashboardStat:View {
    let title:String
    let value:String
    let symbol:String
    var body:some View {
        VStack(alignment:.leading,spacing:8){Image(systemName:symbol).foregroundStyle(DiaryStyle.accent).accessibilityHidden(true);Text(value).font(.title2.weight(.bold)).monospacedDigit();Text(title).font(.caption).foregroundStyle(.secondary)}
            .padding(14).frame(maxWidth:.infinity,minHeight:110,alignment:.leading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:22)).contentShape(RoundedRectangle(cornerRadius:22)).accessibilityElement(children:.combine)
    }
}
struct APIDashboardStats:View {
    @ObservedObject var store:APIStore
    let data:APIValue
    let company:Bool
    @Environment(\.dynamicTypeSize) private var typeSize
    private var columns:[GridItem]{Array(repeating:GridItem(.flexible(),spacing:10),count:typeSize.isAccessibilitySize ? 1 : 2)}
    var body:some View {
        LazyVGrid(columns:columns,spacing:10){
            if company,store.enabled("attendance") {
                NavigationLink{APIAttendanceView(store:store,initialUser:"all",initialDay:store.today,initialActiveOnly:true)}label:{APIDashboardStat(title:"Pracovníci v práci",value:"\(data["stats"]["workersInWork"].int)/\(data["stats"]["workersTotal"].int)",symbol:"person.2")}.buttonStyle(.plain)
            }else if store.enabled("jobs"),store.enabled("jobDay") {
                NavigationLink{APIJobsScreen(store:store,filter:APIDashboardJobFilter(mine:true))}label:{APIDashboardStat(title:"Dnešní návštěvy",value:String(data["stats"]["todayVisits"].int),symbol:"calendar")}.buttonStyle(.plain)
            }
            if store.enabled("jobs") {
                NavigationLink{APIJobsScreen(store:store,filter:APIDashboardJobFilter(state:"in_progress",mine:!company,allDates:true))}label:{APIDashboardStat(title:"Probíhající zakázky",value:String(data["stats"]["inProgress"].int),symbol:"list.clipboard")}.buttonStyle(.plain)
            }
            if company,store.enabled("attendance") {
                NavigationLink{APIAttendanceView(store:store,initialUser:"all",initialDay:store.today)}label:{APIDashboardStat(title:"Dnes člověkohodin",value:APIWorkTimeLogic.hours(Int64(data["stats"]["todayWorkMs"].double)),symbol:"clock")}.buttonStyle(.plain)
            }
            if company,store.enabled("jobs") {
                NavigationLink{APIJobsScreen(store:store,filter:APIDashboardJobFilter(attention:"approval",mine:false,allDates:true))}label:{APIDashboardStat(title:"Čeká na schválení",value:String(data["stats"]["pendingApproval"].int),symbol:"checkmark.seal")}.buttonStyle(.plain)
            }
        }
    }
}
struct APIDashboardPersonRow:View {
    let person:APIValue
    private var kind:String{person["state"].string}
    private var status:String{["work":"Pracuje na zakázce","travel":"Na cestě","break":"Přestávka","other":"V práci","off":"Mimo práci"][kind] ?? "Mimo práci"}
    private var color:Color{switch kind{case "work":return .green;case "travel":return .orange;case "break":return .blue;default:return .secondary}}
    var body:some View {
        HStack(alignment:.top,spacing:10){
            Text(APIJobDetailPresentation.initials(person["name"].string)).font(.caption.weight(.bold)).foregroundStyle(DiaryStyle.accent).frame(width:36,height:36).background(DiaryStyle.soft,in:Circle()).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:4){Text(person["name"].string).font(.subheadline.weight(.semibold));HStack(spacing:4){Image(systemName:kind=="work" ? "play.circle.fill" : kind=="travel" ? "location.circle.fill" : kind=="break" ? "pause.circle.fill" : "circle").foregroundStyle(color);Text(status).foregroundStyle(.secondary)}.font(.caption);if !person["job"].isNull{Text(person["job"].title).font(.caption).foregroundStyle(.secondary).lineLimit(2)}}
            Spacer(minLength:0)
            VStack(alignment:.trailing,spacing:6){Text(APIWorkTimeLogic.hours(Int64(person["workMs"].double))).font(.caption.weight(.semibold)).monospacedDigit();Image(systemName:"chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)}
        }.padding(14).frame(maxWidth:.infinity,alignment:.leading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20)).contentShape(Rectangle()).accessibilityElement(children:.combine)
    }
}
struct APIDashboardProjectRow:View {
    let job:APIValue
    var body:some View {
        VStack(alignment:.leading,spacing:9){
            HStack{Text(job.title).font(.headline);Spacer(minLength:4);Image(systemName:"chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)}
            if !job["customerName"].string.isEmpty{Text(job["customerName"].string).font(.subheadline).foregroundStyle(.secondary)}
            APIJobCompletionSummary(job:job,compact:true)
            if !job["time"].isNull{HStack{Label("\(job["time"]["activeCount"].int) pracuje",systemImage:"person.2");Spacer();Text(APIWorkTimeLogic.hours(Int64(job["time"]["workMs"].double)))}.font(.caption).foregroundStyle(.secondary)}
            if !job["updatedAt"].isNull{Text("Aktualizováno "+APIFormat.date(job["updatedAt"])).font(.caption).foregroundStyle(.secondary)}
        }.padding(14).frame(maxWidth:.infinity,alignment:.leading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:22)).contentShape(Rectangle())
    }
}
struct APIDashboardVisitRow:View {
    let job:APIValue
    let active:Bool
    var body:some View {
        HStack(alignment:.top,spacing:12){
            VStack(spacing:5){Image(systemName:active ? "circle.inset.filled" : job["status"].string=="done" ? "checkmark.circle" : "circle").foregroundStyle(active ? DiaryStyle.accent : .secondary);Rectangle().fill(DiaryStyle.soft).frame(width:2).frame(minHeight:34)}.frame(width:20).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:5){
                HStack{Text(job["arrivalWindowStart"].string.isEmpty ? job["plannedStart"].string.isEmpty ? "Čas neurčen" : job["plannedStart"].string : job["arrivalWindowStart"].string+"–"+job["arrivalWindowEnd"].string).font(.subheadline.weight(.bold));Spacer();Text(APIFormat.status(job["status"].string)).font(.caption).foregroundStyle(.secondary)}
                Text(job["customerName"].string.isEmpty ? job.title : job["customerName"].string).font(.headline)
                if !job["customerName"].string.isEmpty,job.title != job["customerName"].string{Text(job.title).font(.subheadline)}
                if !job["address"].string.isEmpty{Text(job["address"].string).font(.caption).foregroundStyle(.secondary)}
            }
            Image(systemName:"chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
        }.padding(12).background(active ? DiaryStyle.soft : DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20)).contentShape(Rectangle()).accessibilityElement(children:.combine)
    }
}
