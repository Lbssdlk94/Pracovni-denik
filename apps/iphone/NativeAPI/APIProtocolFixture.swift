import Foundation

enum APIProtocolFixture {
    static var enabled:Bool{APIFixtureProtocol.records["protocol-redesign-fixture"]?.bool==true || ProcessInfo.processInfo.arguments.contains("--native-api-protocol-testing")}
    static let template:APIValue = .object(["id":.s("service"),"name":.s("Servis závlahy"),"active":.bool(true),"version":.n(1),"discipline":.s("irrigation"),"jobTypes":.array([.s("service"),.s("installation")]),"sections":.array(APIProtocolLogic.sections.map{.s($0.0)}),"required":.array([.s("date")]),"signatureRequired":.bool(false),"photosRequired":.bool(false),"activities":.array(["Kontrola funkčnosti sekcí","Seřízení postřikovačů","Výměna trysek","Čištění filtrů","Kontrola čerpadla","Nastavení řídicí jednotky"].enumerated().map{i,title in .object(["id":.s("activity-\(i)"),"title":.s(title),"active":.bool(true)])})])
    static var configuration:APIValue{.object(["templates":.array([template]),"version":.n(0)])}
    static func decorate(_ value:APIValue)->APIValue{var v=value;v["protocol"] = .object(["schema":.n(1),"identity":value["job"].merged(["versionHash":.s("fixture-identity-1")]),"templates":.array([template]),"delivery":.array([]),"time":.object(["versionHash":.s("fixture-time-1"),"workers":.array([]),"intervals":.array([])])]);if v["report"]["protocolDetails"]["schema"].int==1{if v["report"]["protocolDetails"]["identity"].isNull{v["report"]["protocolDetails"]["identity"]=v["protocol"]["identity"]};if v["report"]["protocolDetails"]["timeSnapshot"].isNull{v["report"]["protocolDetails"]["timeSnapshot"]=v["protocol"]["time"]}};return v}
}
