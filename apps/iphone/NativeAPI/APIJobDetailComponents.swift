import SwiftUI

struct APIJobStatusBadge:View {
    let status:String
    var label:String? = nil
    private var text:String{label ?? APIFormat.status(status)}
    private var tint:Color{switch status{case "done":return DiaryStyle.accent;case "on_way":return .blue;case "in_progress":return DiaryStyle.accent;default:return DiaryStyle.warning}}
    private var symbol:String{switch status{case "done":return "checkmark.circle";case "on_way":return "location";case "in_progress":return "play.circle";default:return "clock"}}
    var body:some View{Label(text,systemImage:symbol).font(.caption.weight(.semibold)).padding(.horizontal,10).padding(.vertical,6).foregroundStyle(tint).background(tint.opacity(0.12),in:Capsule()).accessibilityLabel("Stav zakázky: "+text)}
}
struct APIJobAvatarStack:View {
    let people:[APIValue]
    var body:some View {
        HStack(spacing:10){
            HStack(spacing:-8){ForEach(Array(people.prefix(3).enumerated()),id:\.offset){_,person in
                Text(APIJobDetailPresentation.initials(person["name"].string)).font(.caption.weight(.bold)).frame(width:36,height:36).background(DiaryStyle.soft,in:Circle()).overlay(Circle().stroke(DiaryStyle.surface,lineWidth:2)).accessibilityHidden(true)
            }}.foregroundStyle(DiaryStyle.accent)
            Text(people.isEmpty ? "Bez přiřazených pracovníků" : people.map{$0["name"].string}.joined(separator:", "))
                .font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
        }.accessibilityElement(children:.ignore).accessibilityLabel(people.isEmpty ? "Bez přiřazených pracovníků" : "Přiřazení pracovníci: "+people.map{$0["name"].string}.joined(separator:", "))
    }
}
struct APIJobCompactHeader:View {
    let job:APIValue
    let states:[APIValue]
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            Text(job.title).font(.title2.weight(.bold)).fixedSize(horizontal:false,vertical:true).accessibilityAddTraits(.isHeader)
            ViewThatFits(in:.horizontal){HStack(spacing:8){tags};VStack(alignment:.leading,spacing:6){tags}}
            Label(schedule,systemImage:"calendar").font(.subheadline.weight(.semibold))
            if !job["address"].string.isEmpty{Label(job["address"].string,systemImage:"mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)}
            APIJobAvatarStack(people:APIJobDetailPresentation.crew(job:job,states:states))
            if job["status"].string=="incomplete",!job["incompleteReason"].string.isEmpty{Text(job["incompleteReason"].string).font(.footnote).foregroundStyle(DiaryStyle.warning)}
        }.frame(maxWidth:.infinity,alignment:.leading)
    }
    @ViewBuilder private var tags:some View {
        APIJobStatusBadge(status:job["status"].string, label:APIJobsPresentation.statusText(job))
        if let type=["service":"Servis","installation":"Realizace","survey":"Zaměření"][job["jobType"].string]{Text(type).font(.caption.weight(.semibold)).padding(.horizontal,10).padding(.vertical,6).background(DiaryStyle.soft,in:Capsule())}
        if let discipline=["irrigation":"Závlaha","garden":"Garden"][job["discipline"].string]{Text(discipline).font(.caption).foregroundStyle(.secondary)}
    }
    private var schedule:String {
        let arrival=job["arrivalWindowStart"].string
        let time=arrival.isEmpty ? job["plannedStart"].string : "Příjezd "+arrival+(job["arrivalWindowEnd"].string.isEmpty ? "" : "–"+job["arrivalWindowEnd"].string)
        return [APIJobDetailPresentation.date(job["dueDate"].string),time].filter{!$0.isEmpty}.joined(separator:" · ")
    }
}
struct APIJobTimeOverview:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let snapshot:APIValue
    let problem:String?
    let retry:()->Void
    @Environment(\.dynamicTypeSize) private var typeSize
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            if snapshot.isNull {
                if let problem {
                    HStack{Label("Pracovní dobu nelze načíst",systemImage:"exclamationmark.circle");Spacer();Button("Znovu",action:retry).diaryBubble()}.font(.footnote)
                    Text(problem).font(.caption).foregroundStyle(.secondary)
                }else{ProgressView("Načítání pracovní doby").frame(minHeight:44)}
            }else{
                TimelineView(.periodic(from:.now,by:30)){context in
                    let summary=APIWorkTimeLogic.summary(snapshot["intervals"].array,now:context.date)
                    let workers=APIJobDetailPresentation.todayWorkers(snapshot:snapshot,jobID:job.id,now:context.date)
                    VStack(alignment:.leading,spacing:10){
                        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:10)) : AnyLayout(HStackLayout(alignment:.top,spacing:10))
                        layout {
                            NavigationLink{APIJobTimeView(store:store,job:job).toolbar(.hidden,for:.tabBar)}label:{APIJobMetric(title:"Člověkohodiny",value:APIWorkTimeLogic.hours(Int64(summary["total"]["workMs"].double)),symbol:"clock")}.buttonStyle(.plain).accessibilityIdentifier("job-hours-summary")
                            NavigationLink{APIJobTimeView(store:store,job:job).toolbar(.hidden,for:.tabBar)}label:{APIJobMetric(title:"Zapojení pracovníci",value:String(summary["workers"].array.count),symbol:"person.2")}.buttonStyle(.plain)
                        }
                        if workers.isEmpty{Text("Dnes zatím bez pracovních intervalů.").font(.caption).foregroundStyle(.secondary)}
                        else {
                            VStack(alignment:.leading,spacing:10){
                                Text("Dnes na zakázce").font(.subheadline.weight(.semibold))
                                ForEach(Array(workers.enumerated()),id:\.offset){_,worker in APIJobWorkerRow(worker:worker)}
                                Divider()
                                HStack{Text("Celkem dnes");Spacer();Text(APIWorkTimeLogic.hours(Int64(workers.reduce(0.0){$0+$1["workMs"].double}))).monospacedDigit()}.font(.caption.weight(.semibold))
                            }.padding(14).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:18))
                        }
                    }
                }
                if !store.online{Label("Uložená kopie · změny čekají na synchronizaci",systemImage:"wifi.slash").font(.caption).foregroundStyle(.secondary)}
                if let problem{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning);Button("Zkusit znovu",action:retry).diaryBubble()}
            }
        }
    }
}
struct APIJobMetric:View {
    let title:String
    let value:String
    let symbol:String
    var body:some View {
        VStack(alignment:.leading,spacing:6){
            Label(title,systemImage:symbol).font(.caption).foregroundStyle(.secondary)
            HStack(alignment:.firstTextBaseline){Text(value).font(.headline).monospacedDigit().fixedSize(horizontal:false,vertical:true);Spacer(minLength:0);Image(systemName:"chevron.right").font(.caption).accessibilityHidden(true)}
        }.padding(14).frame(maxWidth:.infinity,minHeight:76,alignment:.topLeading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:18)).contentShape(RoundedRectangle(cornerRadius:18)).accessibilityElement(children:.combine).accessibilityHint("Otevře podrobnou evidenci pracovní doby")
    }
}
struct APIJobWorkerRow:View {
    let worker:APIValue
    private var kind:String{worker["kind"].string}
    private var color:Color{switch kind{case "work":return .green;case "travel":return .blue;case "break":return .orange;default:return .secondary}}
    private var symbol:String{switch kind{case "work":return "play.circle.fill";case "travel":return "location.circle.fill";case "break":return "pause.circle.fill";default:return "checkmark.circle"}}
    var body:some View {
        HStack(alignment:.top,spacing:8){
            Image(systemName:symbol).foregroundStyle(color).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:3){
                Text(worker["name"].string).font(.subheadline.weight(.semibold))
                Text(APIJobDetailPresentation.workerStatus(kind)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength:4)
            Text(APIWorkTimeLogic.hours(Int64(worker["workMs"].double))).font(.caption.weight(.semibold)).monospacedDigit()
        }.accessibilityElement(children:.combine)
    }
}
