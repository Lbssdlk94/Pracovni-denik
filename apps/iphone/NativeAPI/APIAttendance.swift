import SwiftUI
import CoreLocation
import MapKit

@MainActor
final class APILocation:NSObject,ObservableObject,CLLocationManagerDelegate {
    @Published var position:CLLocation?
    @Published var status="unavailable"
    private let manager=CLLocationManager()
    private var continuation:CheckedContinuation<CLLocation?,Never>?
    private var timeout:Task<Void,Never>?
    override init(){super.init();manager.delegate=self;manager.desiredAccuracy=kCLLocationAccuracyHundredMeters}
    func capture()async->CLLocation?{
        guard continuation==nil else{return nil}
        return await withCheckedContinuation{continuation=$0;timeout=Task{try? await Task.sleep(for:.seconds(12));if !Task.isCancelled{finish(nil,status:"timeout")}};switch manager.authorizationStatus{case .notDetermined:manager.requestWhenInUseAuthorization();case .authorizedWhenInUse,.authorizedAlways:manager.requestLocation();default:finish(nil,status:"denied")}}

    }
    func finish(_ p:CLLocation?,status:String){position=p;self.status=status;timeout?.cancel();timeout=nil;continuation?.resume(returning:p);continuation=nil}
    func locationManagerDidChangeAuthorization(_ manager:CLLocationManager){guard continuation != nil else{return};if [.authorizedWhenInUse,.authorizedAlways].contains(manager.authorizationStatus){manager.requestLocation()}else if manager.authorizationStatus != .notDetermined{finish(nil,status:"denied")}}
    func locationManager(_ manager:CLLocationManager,didUpdateLocations locations:[CLLocation]){finish(locations.last,status:"captured")}
    func locationManager(_ manager:CLLocationManager,didFailWithError error:Error){finish(nil,status:"unavailable")}
    static func json(_ location:CLLocation?)->APIValue{location.map{.object(["latitude":.number($0.coordinate.latitude),"longitude":.number($0.coordinate.longitude),"accuracy":.number(max(0,$0.horizontalAccuracy))])} ?? .null}
}
struct APIAttendanceView:View {
    @ObservedObject var store:APIStore
    @StateObject private var location=APILocation()
    @State private var month=""
    @State private var selectedUser=""
    @State private var data:APIValue = .null
    @State private var problem:String?
    @State private var busy=false
    @State private var punchID=UUID().uuidString
    @State private var action:APIDomainAction?
    private var key:String{month+selectedUser+store.scope+store.revision.uuidString}
    var body:some View{List{
        Section("Moje dnešní docházka"){
            Text(data["activeShift"].isNull ? "Práce není zahájená" : "V práci od "+Self.time(data["activeShift"]["startAt"]))
            Button(data["activeShift"].isNull ? "Zaznamenat příchod" : "Zaznamenat odchod"){Task{await punch()}}.buttonStyle(.borderedProminent).disabled(busy).frame(minHeight:44)
        }
        Section{TextField("Měsíc RRRR-MM",text:$month).textInputAutocapitalization(.never);if store.manager{Picker("Pracovník",selection:$selectedUser){Text("Všichni").tag("all");ForEach(Array(data["employees"].array.enumerated()),id:\.offset){_,p in Text(p["name"].string).tag(p.id)}}}}
        Section("Pracovní dny"){
            ForEach(Array(data["shifts"].array.enumerated()),id:\.offset){_,shift in
                NavigationLink{List{Text(shift["userName"].string).font(.headline);Text(Self.date(shift["startAt"]));Text(Self.time(shift["startAt"])+"–"+(shift["endAt"].isNull ? "dosud" : Self.time(shift["endAt"])));DisclosureGroup("Poloha a podrobnosti"){if store.manager{APIDataPairs(value:shift["startPosition"],labels:["latitude":"Zeměpisná šířka","longitude":"Zeměpisná délka","accuracy":"Přesnost (m)"]);APIDataPairs(value:shift["endPosition"],labels:["latitude":"Odchod – šířka","longitude":"Odchod – délka"])};Text("GPS příchodu: "+shift["startGpsStatus"].string);Text("GPS odchodu: "+shift["endGpsStatus"].string)};Button("Navrhnout opravu"){action=correction(shift,remove:false)};Button("Požádat o smazání",role:.destructive){action=correction(shift,remove:true)}}.navigationTitle("Pracovní den")} label:{VStack(alignment:.leading,spacing:5){Text(Self.date(shift["startAt"])).font(.headline);Text(Self.time(shift["startAt"])+"–"+(shift["endAt"].isNull ? "dosud" : Self.time(shift["endAt"]))).font(.subheadline);if store.manager{Text(shift["userName"].string).font(.caption).foregroundStyle(.secondary)}}.padding(.vertical,6)}
            }
            Button("Doplnit chybějící den"){action=correction(.object(["id":.s(UUID().uuidString),"version":.n(0),"userId":.s(store.userID)]),remove:false)}
        }
        if store.manager && !data["pendingCorrections"].array.isEmpty{Section("Čeká na schválení"){ForEach(Array(data["pendingCorrections"].array.enumerated()),id:\.offset){_,c in VStack(alignment:.leading){Text(c["userName"].string).font(.headline);Text(c["reason"].string);HStack{Button("Schválit"){action=review(c,approve:true)};Button("Zamítnout"){action=review(c,approve:false)}}}}}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Docházka").listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background)
        .task(id:key){if month.isEmpty{month=String(store.today.prefix(7));selectedUser=store.userID};await load()}.refreshable{await store.resume();await load()}
        .sheet(item:$action){APIAttendanceAction(store:store,action:$0)}
    }
    static func time(_ value:APIValue)->String{guard !value.isNull else{return ""};let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="HH:mm";return f.string(from:Date(timeIntervalSince1970:value.double/1000))}
    static func date(_ value:APIValue)->String{let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="d. M. yyyy";return f.string(from:Date(timeIntervalSince1970:value.double/1000))}
    func load()async{do{data=try await store.get("/api/attendance?month="+month+"&userId="+(selectedUser.isEmpty ? store.userID : selectedUser));problem=nil}catch{problem=error.localizedDescription}}
    func punch()async{guard store.online else{problem="Příchod a odchod zaznamenejte s připojením, aby se uložil správný čas.";return};busy=true;defer{busy=false};do{let p=store.enabled("location") ? await location.capture() : nil;var body=APIValue.object(["mutationId":.s(punchID),"kind":.s(data["activeShift"].isNull ? "arrival" : "departure"),"gpsStatus":.s(store.enabled("location") ? location.status : "disabled"),"position":APILocation.json(p)]);if !data["activeShift"].isNull{body["shiftId"]=data["activeShift"]["id"];body["version"]=data["activeShift"]["version"]};_=try await store.write("/api/attendance/punch",method:"POST",body:body);punchID=UUID().uuidString;await load()}catch{problem=error.localizedDescription}}
    func correction(_ shift:APIValue,remove:Bool)->APIDomainAction{APIDomainAction(title:remove ? "Žádost o smazání" : "Oprava docházky",path:"/api/attendance/corrections",fields:[.field("reason","Důvod",.notes,true)],value:.object(["id":.s(UUID().uuidString),"kind":.s(remove ? "delete" : "edit"),"shiftId":.s(shift.id),"version":shift["version"],"userId":shift["userId"],"startAt":shift["startAt"].isNull ? .number(Date().timeIntervalSince1970*1000) : shift["startAt"],"endAt":shift["endAt"],"reason":.s("")]))}
    func review(_ c:APIValue,approve:Bool)->APIDomainAction{APIDomainAction(title:approve ? "Schválit opravu" : "Zamítnout opravu",path:"/api/attendance/corrections/"+c.id+"/review",fields:[.field("note","Poznámka správce",.notes)],value:.object(["decision":.s(approve ? "approve" : "reject"),"kind":c["kind"],"note":.s("")]),confirmation:c["userName"].string+"\n"+c["reason"].string)}
}
struct APIAttendanceAction:View {
    @ObservedObject var store:APIStore
    let action:APIDomainAction
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .null
    @State private var start=Date()
    @State private var end=Date()
    @State private var closed=true
    @State private var problem:String?
    var correction:Bool{action.value["kind"].string=="edit"}
    var body:some View{NavigationStack{Form{if correction{DatePicker("Příchod",selection:$start);Toggle("Směna má odchod",isOn:$closed);if closed{DatePicker("Odchod",selection:$end)}};APIFieldsView(fields:action.fields,value:$value);if let message=action.confirmation{Text(message)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Potvrdit"){Task{do{var body=value;if correction{body["startAt"] = .number((start.timeIntervalSince1970*1000).rounded());body["endAt"] = closed ? .number((end.timeIntervalSince1970*1000).rounded()) : .null};_=try await store.write(action.path,method:action.method,body:body);dismiss()}catch{problem=error.localizedDescription}}}}.navigationTitle(action.title).toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}}.task{value=action.value;start=Date(timeIntervalSince1970:value["startAt"].double/1000);end=value["endAt"].isNull ? Date() : Date(timeIntervalSince1970:value["endAt"].double/1000);closed = !value["endAt"].isNull}}
}
