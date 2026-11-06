import Foundation

enum APIFieldKind: Equatable { case text, notes, integer, decimal, money, liters, toggle, date, time, choice, reference, array, object, password }
struct APIChoice: Identifiable { let id: String; let title: String }
struct APIField: Identifiable {
    let id: String
    let title: String
    var kind: APIFieldKind = .text
    var required = false
    var choices: [APIChoice] = []
    var reference: String? = nil
    var children: [APIField] = []
    var advanced = false
    var feature: String? = nil
    var ownerOnly = false
    var initial:APIValue {
        switch kind {
        case .toggle:return .bool(["active","autoPlan","deduct","included"].contains(id))
        case .array:return .array([])
        case .object:return .object(Dictionary(uniqueKeysWithValues:children.map{($0.id,$0.initial)}))
        case .integer,.decimal,.money,.liters:return .n(0)
        case .choice:return .s(choices.first?.id ?? "")
        default:return .s("")
        }
    }
    static func text(_ id: String, _ title: String, _ required: Bool = false) -> APIField { APIField(id:id,title:title,required:required) }
    static func field(_ id: String, _ title: String, _ kind: APIFieldKind, _ required: Bool = false) -> APIField { APIField(id:id,title:title,kind:kind,required:required) }
    static func choice(_ id: String, _ title: String, _ values: String) -> APIField { APIField(id:id,title:title,kind:.choice,choices:values.split(separator:"|").map { let p=$0.split(separator:":",maxSplits:1,omittingEmptySubsequences:false);return APIChoice(id:String(p[0]),title:String(p.count>1 ? p[1] : p[0])) }) }
    static func ref(_ id: String, _ title: String, _ path: String, required: Bool = false) -> APIField { APIField(id:id,title:title,kind:.reference,required:required,reference:path) }
    static func array(_ id: String, _ title: String, _ fields: [APIField]) -> APIField { APIField(id:id,title:title,kind:.array,children:fields) }
    static func object(_ id: String, _ title: String, _ fields: [APIField]) -> APIField { APIField(id:id,title:title,kind:.object,children:fields,advanced:true) }
}
enum APIEntity: String, CaseIterable {
    case jobs, customers, gardens, defects, materials, categories, vehicles, entries, drivers, tariffs, subscriptions, services, history, shafts, notifications, team
    var title: String { [.jobs:"Zakázky",.customers:"Zákazníci",.gardens:"Zahrady",.defects:"Závady",.materials:"Materiál",.categories:"Kategorie materiálu",.vehicles:"Vozidla",.entries:"Provozní záznamy",.drivers:"Řidiči",.tariffs:"Správa tarifů",.subscriptions:"Předplatné",.services:"Servis",.history:"Historie",.shafts:"Šachty",.notifications:"Upozornění",.team:"Tým"][self]! }
    var symbol: String { [.jobs:"list.clipboard",.customers:"person.crop.rectangle",.gardens:"leaf",.defects:"exclamationmark.triangle",.materials:"shippingbox",.categories:"square.grid.2x2",.vehicles:"car",.entries:"fuelpump",.drivers:"person.fill",.tariffs:"tag",.subscriptions:"checkmark.seal",.services:"wrench",.history:"clock.arrow.circlepath",.shafts:"photo",.notifications:"bell",.team:"person.2"][self]! }
    var feature: String { [.categories:"materials",.entries:"vehicles",.drivers:"vehicles",.tariffs:"subscriptions",.services:"service",.history:"gardenHistory",.team:"teamManagement" ][self] ?? rawValue }
    var managerOnly: Bool { [.tariffs,.team].contains(self) }
    var canCreate: Bool { ![.history,.notifications,.drivers].contains(self) }
}
struct APIResource: Identifiable {
    var entity: APIEntity
    var parent: String = ""
    var seed: APIValue = .object([:])
    var id: String { entity.rawValue + ":" + parent }
    var title: String { entity.title }
    var listPath: String {
        switch entity {
        case .jobs: return "/api/jobs?state=all&order=schedule"
        case .materials,.categories: return "/api/materials"
        case .entries: return "/api/vehicles/"+parent
        case .drivers: return "/api/vehicles/drivers"
        case .services: return "/api/gardens/"+parent+"/services"
        case .history: return "/api/gardens/"+parent+"/history"
        default: return "/api/"+entity.rawValue
        }
    }
    var listKey: String { [.materials:"items",.categories:"categories",.entries:"entries",.drivers:"drivers",.history:"visits",.shafts:"records",.team:"members"][entity] ?? entity.rawValue }
    func recordPath(_ id: String) -> String {
        switch entity {
        case .materials: return "/api/materials/items/"+id
        case .categories: return "/api/materials/categories/"+id
        case .entries: return "/api/vehicles/"+parent+"/entries/"+id
        case .drivers: return "/api/vehicles/drivers/"+id
        case .services: return "/api/gardens/"+parent+"/services/"+id
        default: return "/api/"+entity.rawValue+"/"+id
        }
    }
    var recordKey: String { [.jobs:"job",.customers:"customer",.gardens:"garden",.defects:"defect",.materials:"item",.categories:"category",.vehicles:"vehicle",.entries:"entry",.drivers:"driver",.tariffs:"tariff",.subscriptions:"subscription",.services:"service",.shafts:"record"][entity] ?? "" }
    @MainActor func editable(_ store: APIStore) -> Bool {
        switch entity {
        case .jobs,.customers,.materials,.categories,.vehicles,.drivers,.tariffs,.subscriptions,.team: return store.manager
        case .history,.notifications: return false
        default: return store.writer
        }
    }
    var fields: [APIField] {
        switch entity {
        case .jobs:
            return [.ref("customerId","Zákazník","customers"),.ref("gardenId","Konkrétní zahrada","gardens"),.text("title","Název práce",true),.choice("jobType","Druh","service:Servis|installation:Realizace|survey:Zaměření"),.field("dueDate","Datum návštěvy",.date),.field("plannedStart","Plánovaný začátek práce",.time),.field("estimatedMinutes","Odhad délky práce (min)",.integer),.array("assignedTos","Přiřazení kolegové",[.ref("value","Kolega","people",required:true)]),.ref("customerAddressId","Adresa realizace ze seznamu","addresses"),.text("address","Adresa realizace"),.text("city","Město / obec"),.field("description","Zadání práce",.notes),.field("arrivalWindowStart","Domluvený příjezd od",.time),.field("arrivalWindowEnd","Domluvený příjezd do",.time),.choice("legacyTimeMeaning","Význam původního času","unknown:K upřesnění|arrival:Rozmezí příjezdu|work:Práce|reference:Orientační čas"),.field("startTime","Původní čas od",.time),.field("endTime","Původní čas do",.time),.array("defectIds","Řešené závady",[.ref("value","Závada","defects",required:true)]),.text("customerName","Jméno při ručním zadání"),.choice("discipline","Obor","irrigation:Závlaha|garden:Garden")]
        case .customers:
            return [.text("name","Jméno nebo název",true),.text("email","E-mail"),.array("phones","Telefony",[.text("label","Popisek"),.text("number","Telefonní číslo",true)]),.array("addresses","Adresy",[.text("label","Název místa"),.text("address","Ulice a číslo",true),.text("city","Město / obec")]),.field("contactNotes","Společné kontaktní poznámky",.notes),.choice("irrigationOrigin","Původ závlahy",":Neuvedeno|ours:Naše realizace|external:Cizí realizace|unknown:Neznámý"),.object("billing","Fakturační údaje",APISchemas.billing),.choice("discipline","Obor nového zákazníka","irrigation:Závlaha|garden:Garden")]
        case .gardens:
            return [.text("name","Název zahrady",true),.ref("customerId","Zákazník","customers"),.text("address","Adresa"),.field("sharedDescription","Společný popis zahrady",.notes),.field("notes","Pracovní poznámky oboru",.notes),.text("pumpType","Typ čerpadla"),.choice("discipline","Obor","irrigation:Závlaha|garden:Garden")]
        case .defects:
            return [.ref("gardenId","Zahrada","gardens",required:true),.text("title","Název závady",true),.field("description","Popis závady",.notes),.text("location","Přesné místo"),.choice("priority","Priorita","low:Nízká|normal:Běžná|high:Vysoká"),.choice("status","Stav","new:Nová|awaiting_part:Čeká na díl|repair_planned:Oprava naplánována|resolved:Vyřešeno"),.field("discoveredOn","Datum zjištění",.date,true),.ref("assignedTo","Odpovědný pracovník","defectPeople"),.field("nextStep","Další krok",.notes),.field("resolution","Popis opravy při vyřešení",.notes),.ref("sourceJobId","Zdrojová zakázka","jobs"),.array("repairJobIds","Navazující opravy",[.ref("value","Zakázka","jobs")]),.choice("discipline","Obor","irrigation:Závlaha|garden:Garden")]
        case .materials: return [.text("name","Název",true),.ref("categoryId","Kategorie","categories",required:true),.text("sku","Rozměr, varianta nebo kód"),.text("unit","Jednotka",true),.field("priceMinor","Cena za jednotku",.money,true),.text("currency","Měna",true),.field("active","V nabídce",.toggle)]
        case .categories: return [.text("name","Název kategorie",true),.field("sortOrder","Pořadí",.integer),.field("active","Aktivní",.toggle)]
        case .vehicles: return [.text("name","Název vozidla",true),.text("plate","SPZ"),.text("model","Model"),.text("vin","VIN"),.field("odometer","Stav tachometru (km)",.integer,true),.field("inspectionDate","Platnost STK",.date),.field("vignetteDate","Platnost dálniční známky",.date),.field("leadDays","Upozornit dní předem",.integer),.field("notes","Poznámka",.notes)]
        case .entries: return [.choice("kind","Druh záznamu","fuel:Tankování|service:Servis|other:Jiný náklad"),.field("date","Datum",.date,true),.field("costMinor","Částka",.money,true),.field("litersMilli","Litry",.liters),.field("odometer","Tachometr (km)",.integer,true),.field("full","Plná nádrž",.toggle),.text("station","Čerpací stanice"),.field("note","Poznámka",.notes)]
        case .drivers: return [.field("enabled","Řidič",.toggle),.ref("vehicleId","Přiřazené vozidlo","vehicles")]
        case .services: return [.field("date","Datum provedení",.date,true),.field("work","Provedené práce",.notes,true),.field("parts","Použitý materiál",.notes),.field("notes","Poznámka",.notes),.choice("discipline","Obor","irrigation:Závlaha|garden:Garden")]
        case .tariffs: return [.field("active","Aktivní tarif",.toggle),.object("definition","Podmínky tarifu",APISchemas.tariff)]
        default: return []
        }
    }
    @MainActor func initial(_ store: APIStore) -> APIValue {
        var v = APIValue.object(["id":.s(UUID().uuidString),"version":.n(0),"active":.bool(true),"date":.s(store.today),"discoveredOn":.s(store.today),"status":.s(entity == .defects ? "new" : "planned"),"priority":.s("normal"),"jobType":.s("service"),"kind":.s("fuel"),"currency":.s("CZK"),"unit":.s("ks"),"legacyTimeMeaning":.s("unknown"),"leadDays":.n(30),"odometer":.n(0),"full":.bool(false)])
        for field in fields where v[field.id].isNull {v[field.id]=field.initial}
        if entity == .jobs {v["estimatedMinutes"] = .null}
        if entity == .tariffs {v["definition"]["currency"] = .s("CZK");v["definition"]["billingPeriod"] = .s("yearly")}

        if !store.me["workspace"].isNull {let selected=store.transport.discipline;v["discipline"] = .s(["garden","irrigation"].contains(selected) ? selected : store.transport.origin.host?.hasPrefix("dr-garden")==true ? "garden" : "irrigation")}
        if store.me["workspace"]["disciplines"].array.count == 1 { v["discipline"] = store.me["workspace"]["disciplines"].array[0] }
        return v.merged(seed.object)
    }
}
struct APIRoute: Identifiable { let id = UUID(); let resource: APIResource; var value: APIValue; var isNew = false }
enum APISchemas {
    static let billing: [APIField] = [.text("name","Fakturační název"),.text("address","Úplná fakturační adresa"),.text("companyId","IČO"),.text("taxId","DIČ"),.text("email","E-mail"),.text("phone","Telefon"),.text("bankAccount","Bankovní účet")]

    static let service: [APIField] = [.field("date","Datum provedení",.date,true),.field("work","Provedené práce",.notes),.field("material","Použitý materiál – poznámka",.notes),.field("defects","Zjištěné závady",.notes),.field("notes","Poznámka",.notes),.field("recommendations","Doporučení pro příště",.notes)]
    static let tariffService: [APIField] = [.text("name","Název služby",true),.field("description","Popis",.notes),.field("count","Počet provedení",.integer,true),.choice("frequency","Četnost","yearly:V průběhu období|monthly:Měsíčně|quarterly:Čtvrtletně|custom:V doporučených měsících"),.array("months","Doporučené měsíce",[.field("value","Měsíc (1–12)",.integer)]),.field("autoPlan","Automaticky plánovat",.toggle),.field("deduct","Odečítat z počtu",.toggle),.field("included","V ceně",.toggle),.text("limit","Omezení rozsahu"),.choice("kind","Druh služby","service:Servis|blowout:Vyfouknutí|spring:Jarní spuštění|other:Jiná služba")]
    static let tariff: [APIField] = [.text("code","Kód tarifu",true),.field("autoConfirm","Automaticky potvrzovat plán",.toggle),.text("name","Název tarifu",true),.field("priceMinor","Cena",.money,true),.text("currency","Měna",true),.choice("billingPeriod","Období","yearly:Roční|monthly:Měsíční"),.field("description","Popis",.notes),.array("services","Služby",tariffService),.array("benefits","Výhody v pořadí",[.text("value","Výhoda")]),.field("priority","Přednostní servis",.toggle),.text("visitLimit","Maximální rozsah návštěvy"),.field("terms","Vlastní podmínky",.notes),.field("partsIncluded","Náhradní díly v ceně",.toggle),.field("extraRepairsIncluded","Mimořádné opravy v ceně",.toggle)]
}
