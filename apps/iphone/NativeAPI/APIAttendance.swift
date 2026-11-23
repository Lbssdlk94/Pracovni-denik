import SwiftUI
import CoreLocation
import MapKit

@MainActor
final class APILocation:NSObject,ObservableObject,@preconcurrency CLLocationManagerDelegate {
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
enum APIAttendanceWorkflow {
    @MainActor static func punch(store:APIStore,activeShift:APIValue,location:APILocation,operationID:String,offline:Bool=false,at:Double?=nil)async throws {
        try store.requireLiveRole()
        guard store.online || offline else{throw APIError.local("Příchod a odchod zaznamenejte s připojením, aby se uložil správný čas.")}
        let scope=store.scope
        store.beginEdit();defer{store.endEdit()}
        let position=store.enabled("location") && store.online ? await location.capture() : nil
        guard scope==store.scope else{throw APIError.local("Účet nebo oprávnění se změnily.")}
        var input=APIValue.object(["mutationId":.s(operationID),"kind":.s(activeShift.isNull ? "arrival" : "departure"),"gpsStatus":.s(!store.enabled("location") ? "disabled" : store.online ? location.status : "unavailable"),"position":APILocation.json(position)])
        if offline{input["at"] = .number((at ?? Date().timeIntervalSince1970*1000).rounded())}
        if !activeShift.isNull{input["shiftId"]=activeShift["id"];input["version"]=activeShift["version"]}
        _ = try await store.write("/api/attendance/punch",method:"POST",body:input,offline:offline,operationID:operationID,dependsOn:offline ? store.outbox.filter{$0.state=="pending" && ($0.path.hasPrefix("/api/attendance/") || $0.path.hasSuffix("/time/actions"))}.map(\.id) : [])
    }
}
enum APIAttendanceActions {
    static func correction(_ shift:APIValue,remove:Bool)->APIDomainAction{APIDomainAction(title:remove ? "Žádost o smazání" : "Oprava docházky",path:"/api/attendance/corrections",fields:[.field("reason","Důvod",.notes,true)],value:.object(["id":.s(UUID().uuidString),"kind":.s(remove ? "delete" : "edit"),"shiftId":.s(shift.id),"version":shift["version"],"userId":shift["userId"],"startAt":shift["startAt"].isNull ? .number(Date().timeIntervalSince1970*1000) : shift["startAt"],"endAt":shift["endAt"],"reason":.s("")]))}
    static func managerDelete(_ shift:APIValue)->APIDomainAction{APIDomainAction(title:"Smazat záznam docházky",path:"/api/attendance/shifts/"+shift.id+"/delete",fields:[.field("reason","Důvod",.notes,true)],value:.object(["id":.s(UUID().uuidString),"version":shift["version"],"reason":.s("")]),confirmation:"Záznam se smaže hned. Navázaná práce se nemaže. Pokud vazba existuje, server smazání odmítne a časovač zůstane.")}
    static func withdraw(_ c:APIValue)->APIDomainAction{APIDomainAction(title:"Stáhnout žádost",path:"/api/attendance/corrections/"+c.id+"/review",value:.object(["decision":.s("withdraw")]),confirmation:"Žádost se stáhne a záznam zůstane beze změny.")}
    static func review(_ c:APIValue,approve:Bool)->APIDomainAction{APIDomainAction(title:approve ? "Schválit opravu" : "Zamítnout opravu",path:"/api/attendance/corrections/"+c.id+"/review",fields:[.field("note","Poznámka správce",.notes)],value:.object(["decision":.s(approve ? "approve" : "reject"),"kind":c["kind"],"note":.s("")]),confirmation:c["userName"].string+"\n"+c["reason"].string)}
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
    @State private var busy=false
    var correction:Bool{action.path=="/api/attendance/corrections" && action.value["kind"].string=="edit"}
    var body:some View{NavigationStack{Form{if correction{DatePicker("Příchod",selection:$start);Toggle("Směna má odchod",isOn:$closed);if closed{DatePicker("Odchod",selection:$end)}};APIFieldsView(fields:action.fields,value:$value);if let message=action.confirmation{Text(message)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Potvrdit"){Task{guard !busy else{return};busy=true;defer{busy=false};do{var body=value;if correction{body["startAt"] = .number((start.timeIntervalSince1970*1000).rounded());body["endAt"] = closed ? .number((end.timeIntervalSince1970*1000).rounded()) : .null};_=try await store.write(action.path,method:action.method,body:body,offline:correction,operationID:correction ? body["id"].string : nil);dismiss()}catch{problem=error.localizedDescription}}}.disabled(busy || store.isRolePreview)}.environment(\.locale,Locale(identifier:"cs_CZ")).environment(\.timeZone,APIAttendanceLogic.calendar.timeZone).navigationTitle(action.title).toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}}.task{value=action.value;start=Date(timeIntervalSince1970:value["startAt"].double/1000);end=value["endAt"].isNull ? Date() : Date(timeIntervalSince1970:value["endAt"].double/1000);closed = !value["endAt"].isNull}}
}
