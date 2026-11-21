import SwiftUI
import UniformTypeIdentifiers

// An entry point for the existing CSV projection, available to the same person
// as on the web. The approved attendance screen and its controls stay intact.
struct APIPersonalAttendanceExport:View {
    @ObservedObject var store:APIStore
    @StateObject private var model=APIAttendanceModel()
    @State private var selectedMonth=Date()
    @State private var choosingMonth=false
    @State private var exporting=false
    @State private var problem:String?
    private var month:String{APIAttendanceLogic.month(selectedMonth)}
    private var data:APIValue{model.projected(store:store)}
    private var records:[APIAttendanceDay]{
        let start=APIAttendanceLogic.monthDate(month)
        let end=APIAttendanceLogic.calendar.date(byAdding:.month,value:1,to:start)!
        return APIAttendanceLogic.days(shifts:data["detail"]["shifts"].array.filter{$0["userId"].string==store.userID},intervals:data["detail"]["intervals"].array.filter{$0["userId"].string==store.userID},from:start,to:end)
    }
    var body:some View {
        Form {
            Section("Vlastní výkaz") {
                Text(store.me["user"]["name"].string)
                Button {choosingMonth=true} label: {
                    HStack {Label("Měsíc",systemImage:"calendar");Spacer();Text(APIAttendanceLogic.label(selectedMonth,format:"LLLL yyyy")).foregroundStyle(.secondary)}.frame(minHeight:44)
                }.accessibilityIdentifier("personal-export-month")
                Text("Export obsahuje pouze vaši docházku. Průběžné a neodeslané hodiny jsou oddělené od potvrzeného výkazu.").font(.footnote).foregroundStyle(.secondary)
            }
            if model.loading{Section{ProgressView("Načítám výkaz…")}}
            if !model.data.isNull {
                Section("Souhrn") {
                    LabeledContent("Uzavřené čisté hodiny",value:APIAttendanceLogic.hours(records.reduce(0){$0+$1.confirmed}))
                    LabeledContent("Průběžné hodiny",value:APIAttendanceLogic.hours(records.reduce(0){$0+max(0,$1.net-$1.confirmed)}))
                    if !store.online{Label("Offline · uložená data",systemImage:"wifi.slash")}
                    else if data["_attendanceCache"]["stale"].bool{Label("Uložená kopie · spojení není ověřené",systemImage:"clock.arrow.circlepath")}
                    if records.isEmpty{Text("Pro tento měsíc nejsou uložené směny.").foregroundStyle(.secondary)}
                }
                Section {
                    Button("Uložit vlastní CSV",systemImage:"square.and.arrow.up"){exporting=true}
                        .frame(minHeight:44).disabled(model.loading || data["detail"]["activitySchema"].int != 1)
                        .accessibilityIdentifier("personal-export-save")
                    if data["detail"]["activitySchema"].int != 1{Text("Podrobný export vyžaduje aktualizaci serveru.").font(.footnote)}
                }
            }
            if let error=problem ?? model.problem{Section{Text(error).foregroundStyle(DiaryStyle.warning);Button("Zkusit znovu"){Task{await load(refresh:true)}}}}
        }.navigationTitle("Export mé docházky").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(DiaryStyle.background).tint(DiaryStyle.accent)
            .task(id:month+store.scope+store.revision.uuidString){await load()}
            .refreshable{await load(refresh:true)}
            .sheet(isPresented:$choosingMonth){APIAttendanceMonthPicker(month:$selectedMonth)}
            .fileExporter(isPresented:$exporting,document:APIAttendanceCSV(text:APIAttendanceLogic.csv(records)),contentType:.commaSeparatedText,defaultFilename:"moje-dochazka-"+month){result in if case .failure(let error)=result{problem=error.localizedDescription}}
    }
    private func load(refresh:Bool=false)async{await model.load(store:store,month:month,user:store.userID,discipline:"all",refresh:refresh)}
}
