import SwiftUI

struct APISettings:View {
    @ObservedObject var store:APIStore
    @State private var problem:String?
    var body:some View{List{
        if store.canPreviewRoles{Section("Náhled deníku"){APIRolePreviewPicker(store:store);Text("Zobrazí menu a ovládání role s vašimi daty. V náhledu se změny neukládají.").font(.footnote)}}
        Section{Text(store.me["user"]["name"].string).font(.headline);Text(store.company).foregroundStyle(.secondary)}
        if store.enabled("notifications"){Section{Button("Upozornění na iPhonu"){NativePushController.shared.showSettings=true};NavigationLink("Výběr oznámení"){APIConfigView(store:store,spec:.preferences)}}}
        Section("Účet"){Picker("Firma",selection:Binding(get:{store.transport.origin.host ?? ""},set:{host in Task{do{try await store.switchInstallation(URL(string:"https://"+host+"/")!)}catch{problem=error.localizedDescription}}})){Text("Dr. Závlaha").tag("zavlahovy-denik.purplecedar.chatgpt.site");Text("Dr. Garden").tag("dr-garden.purplecedar.chatgpt.site")};NavigationLink("Moje přihlášení"){APIPasswordView(store:store)};NavigationLink("Přihlášená zařízení"){APISessionsView(store:store)};Button("Apple Watch"){WatchPhoneCoordinator.shared.showSettings=true};if !store.me["workspace"].isNull{Picker("Pracovní obor",selection:Binding(get:{store.transport.discipline},set:{v in Task{do{try await store.switchDiscipline(v)}catch{problem=error.localizedDescription}}})){if store.me["workspace"]["disciplines"].array.count>1{Text("Oba obory").tag("all")};ForEach(store.me["workspace"]["disciplines"].array.map(\.string),id:\.self){Text($0=="irrigation" ? "Závlaha" : "Garden").tag($0)}}}}
        if store.manager{
            Section("Firma"){
                NavigationLink("Firma a fakturace"){APIConfigView(store:store,spec:.invoice)}
                if store.owner{NavigationLink("Uchování GPS"){APIPrivacyView(store:store)};NavigationLink("Název firmy"){APIConfigView(store:store,spec:.installation)};NavigationLink("Sazby práce a cesty"){APIConfigView(store:store,spec:.rates)}}
                if store.enabled("notifications"){NavigationLink("Připomínky materiálu"){APIConfigView(store:store,spec:.reminders)}}
                if store.enabled("jobs"){NavigationLink("Rezerva mezi návštěvami"){APIConfigView(store:store,spec:.planning)}}
                if store.enabled("zoneManagement"){NavigationLink("Zóny závlahy"){APIZonesView(store:store)}}
            }
            Section("Integrace"){
                if store.enabled("googleDrive"){NavigationLink("Google Disk"){APIDriveSettings(store:store)}}
                if store.enabled("emailNotifications"){NavigationLink("Resend – odesílání e-mailů"){APIConfigView(store:store,spec:.email)}}
            }
            if store.enabled("backups"){Section("Zálohy a data"){NavigationLink("Úplné serverové zálohy"){APIBackupsView(store:store)};NavigationLink("Kontrola vazeb"){APIRecordLinksView(store:store)};NavigationLink("Technický stav"){APIHealthView(store:store)}}}
            Section("Dostupné moduly"){Text("Moduly této firmy nastavuje pouze provozovatel v Super Adminu.").font(.footnote);DisclosureGroup("Povolené funkce"){ForEach(store.me["features"].object.keys.sorted(),id:\.self){key in if store.enabled(key){Text(APIFeatureNames.name(key)).font(.caption)}}}}
        }
        Section{Button("Odhlásit se",role:.destructive){Task{do{try await store.logout()}catch{problem=error.localizedDescription}}}.frame(minHeight:44);Text("Pracovní deník · 0.8.0").font(.footnote).foregroundStyle(.secondary)}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Nastavení").listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background)}
}
struct APIConfigSpec {
    let title:String
    let path:String
    var fields:[APIField]
    var key:String?=nil
    var readKey:String?=nil
    var hasVersion=true
    static let invoice=APIConfigSpec(title:"Firma a fakturace",path:"/api/invoice-company",fields:APISchemas.billing,key:"company")
    static let installation=APIConfigSpec(title:"Název firmy",path:"/api/installation",fields:[.text("name","Název firmy",true)])
    static let rates=APIConfigSpec(title:"Sazby práce a cesty",path:"/api/work-rates",fields:[.field("hourlyMinor","Každá započatá hodina",.money,true),.field("travelMinor","Každých započatých 30 km",.money,true)],readKey:"rate")
    static let reminders=APIConfigSpec(title:"Připomínky materiálu",path:"/api/service-reminders/settings",fields:[.field("enabled","Zapnuté",.toggle),.field("days","Dní předem",.integer),.choice("dayMode","Počítání dní","workdays:Pracovní dny|calendar:Kalendářní dny"),.field("shiftNonWorking","Posunout víkend / svátek na pracovní den",.toggle)],key:"settings")
    static let preferences=APIConfigSpec(title:"Výběr oznámení",path:"/api/notifications/preferences",fields:[.field("jobs","Zakázky",.toggle),.field("attendance","Docházka",.toggle)],readKey:"preferences",hasVersion:false)
    static let planning=APIConfigSpec(title:"Rezerva mezi návštěvami",path:"/api/jobs/planning-settings",fields:[.field("bufferMinutes","Rezerva mezi návštěvami (min)",.integer)])
    static let email=APIConfigSpec(title:"Resend",path:"/api/email-settings",fields:[.field("enabled","Povolit odesílání",.toggle),.text("from","Adresa odesílatele"),.field("apiKey","Nový API klíč (prázdné = ponechat)",.password)])
}
struct APIConfigView:View {
    @ObservedObject var store:APIStore
    let spec:APIConfigSpec
    @State private var value:APIValue = .object([:])
    @State private var version:APIValue = .n(0)
    @State private var problem:String?
    @State private var busy=false
    var body:some View{Form{APIFieldsView(fields:spec.fields,value:$value);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Uložit"){Task{await save()}}.disabled(busy)}.navigationTitle(spec.title).task{do{let response=try await store.get(spec.path);version=response["version"];value=spec.key.map{response[$0]} ?? spec.readKey.map{response[$0]} ?? response}catch{problem=error.localizedDescription}}}
    func save()async{busy=true;defer{busy=false};do{var input=value.selecting(spec.fields.map(\.id));if spec.title=="Resend" && input["apiKey"].string.isEmpty{var o=input.object;o.removeValue(forKey:"apiKey");input = .object(o)};if let key=spec.key{input = .object([key:input])};if spec.hasVersion{input["version"]=version};let result=try await store.write(spec.path,method:"PUT",body:input);version=result["version"];value=spec.key.map{result[$0]} ?? spec.readKey.map{result[$0]} ?? result;problem="Uloženo."}catch{problem=error.localizedDescription}}
}
struct APIPasswordView:View {
    @ObservedObject var store:APIStore
    var mandatory=false
    @State private var username=""
    @State private var current=""
    @State private var password=""
    @State private var repeated=""
    @State private var problem:String?
    @State private var busy=false
    var body:some View{Form{Section(mandatory ? "Nastavte vlastní heslo" : "Moje přihlášení"){TextField("Přihlašovací jméno",text:$username).textContentType(.username).textInputAutocapitalization(.never);SecureField("Současné heslo",text:$current).textContentType(.password);SecureField("Nové heslo",text:$password).textContentType(.newPassword);SecureField("Nové heslo znovu",text:$repeated).textContentType(.newPassword);Button("Uložit vlastní heslo"){Task{await save()}}.disabled(busy)};Text("Zapomenuté heslo obnovuje pouze administrátor firmy.").font(.footnote);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle("Přihlášení").task{if let account=try? await store.transport.request("/api/auth/account"){username=account["username"].string}}}
    func save()async{guard password==repeated,password.count>=12 else{problem="Hesla se musí shodovat a mít alespoň 12 znaků.";return};busy=true;defer{busy=false};do{try await store.changePassword(username:username,current:current,password:password);current="";password="";repeated="";problem="Heslo bylo změněno."}catch{problem=error.localizedDescription}}
}
struct APITeamContent:View {
    @ObservedObject var store:APIStore
    let member:APIValue
    @Binding var action:APIDomainAction?
    @State private var reset=false
    var roleChoices:String{store.owner ? "administrator:Administrátor|admin:Správce|worker:Pracovník|reader:Čtenář" : store.role=="administrator" ? "admin:Správce|worker:Pracovník|reader:Čtenář" : "worker:Pracovník|reader:Čtenář"}
    var body:some View{VStack(alignment:.leading,spacing:18){Text(member["name"].string).font(.title2.bold());Text(member["email"].string);Text(["owner":"Vlastník","administrator":"Administrátor","admin":"Správce","worker":"Pracovník","reader":"Čtenář"][member["role"].string] ?? member["role"].string)
        if store.manager && member["role"].string != "owner"{Button("Změnit roli"){action=APIDomainAction(title:"Oprávnění kolegy",path:"/api/members/"+member.id,method:"PATCH",fields:[.choice("role","Oprávnění",roleChoices)],value:.object(["role":member["role"]]))};if !store.me["workspace"].isNull{Button("Změnit příslušnost k oborům"){action = .membership(record:member,kind:"members")}}}
        if store.role=="administrator"{Button("Obnovit heslo"){reset=true}}
        if store.manager && store.enabled("vehicles"){Button("Řidič a přiřazené auto"){Task{await driver()}}}
    }.diaryCard().sheet(isPresented:$reset){APILocalAccountEditor(store:store,member:member)}}
    func driver()async{do{let response=try await store.get("/api/vehicles/drivers"),current=response["drivers"].array.first{$0["userId"].string==member.id} ?? .object(["version":.n(0),"enabled":.bool(false)]);action=APIDomainAction(title:"Řidič",path:"/api/vehicles/drivers/"+member.id,method:"PUT",fields:APIResource(entity:.drivers).fields,value:.object(["operationId":.s(UUID().uuidString),"version":current["version"],"enabled":current["enabled"],"vehicleId":current["vehicleId"]]))}catch{store.error=error.localizedDescription}}
}
struct APILocalAccountEditor:View {
    @ObservedObject var store:APIStore
    var member:APIValue?=nil
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .object(["role":.s("worker")])
    @State private var result:APIValue = .null
    @State private var version:APIValue = .n(0)
    @State private var problem:String?
    var fields:[APIField]{var f:[APIField]=[];if member==nil{f += [.text("name","Jméno kolegy",true),.text("email","Kontaktní e-mail"),.choice("role","Oprávnění",store.owner ? "administrator:Administrátor|admin:Správce|worker:Pracovník|reader:Čtenář" : store.role=="administrator" ? "admin:Správce|worker:Pracovník|reader:Čtenář" : "worker:Pracovník|reader:Čtenář")]};if member==nil && !store.me["workspace"].isNull{f.append(.choice("accessDiscipline","Pracovní tým","irrigation:Závlaha|garden:Garden|both:Oba týmy"))};f += [.text("username","Přihlašovací jméno",true),.field("password","Dočasné heslo (prázdné = vytvořit bezpečné)",.password)];return f}
    var body:some View{NavigationStack{Form{if result.isNull{APIFieldsView(fields:fields,value:$value);Button(member==nil ? "Vytvořit účet" : "Nastavit nové přihlášení"){Task{await save()}}}else{Text("Přihlašovací jméno: "+result["username"].string).textSelection(.enabled);Text("Dočasné heslo: "+result["temporaryPassword"].string).textSelection(.enabled);Text("Údaje se znovu nezobrazí. Kolega si při prvním přihlášení změní heslo.").font(.footnote)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle(member==nil ? "Nový účet" : "Obnovení hesla").toolbar{ToolbarItem(placement:.cancellationAction){Button("Hotovo"){value = .null;result = .null;dismiss()}}}}.interactiveDismissDisabled().editLease(store).task{if member==nil{value["accessDiscipline"] = .s(store.transport.origin.host?.hasPrefix("dr-garden")==true ? "garden" : "irrigation")};if let member,let account=try? await store.get("/api/local-accounts/"+member.id){version=account["version"];value["username"]=account["username"]}}}
    func save()async{do{var body=value.selecting(fields.map(\.id).filter{$0 != "accessDiscipline"});if body["password"].string.isEmpty{var o=body.object;o.removeValue(forKey:"password");body = .object(o)};if member != nil{body["version"]=version}else if !store.me["workspace"].isNull{let selection=value["accessDiscipline"].string;guard ["irrigation","garden","both"].contains(selection)else{throw APIError.local("Vyberte pracovní tým nového kolegy.")};body["disciplines"] = .array(selection=="both" ? [.s("irrigation"),.s("garden")] : [.s(selection)])};result=try await store.write("/api/local-accounts"+(member.map{"/"+$0.id} ?? ""),method:member==nil ? "POST" : "PUT",body:body);value["password"] = .s("")}catch{problem=error.localizedDescription}}
}
struct APIHealthView:View {
    @ObservedObject var store:APIStore
    @State private var data:APIValue = .null
    var body:some View{List{APIDataPairs(value:data,labels:["scheduledHealthy":"Automatický běh ověřen","installationId":"Instalace","activeUsers":"Aktivní uživatelé","lastBackupAt":"Poslední záloha"]);Text("Technické informace neobsahují hesla ani API klíče.").font(.footnote)}.navigationTitle("Technický stav").task{do{data=try await store.get("/api/operations/health")}catch{store.error=error.localizedDescription}}}
}
enum APIFeatureNames {static func name(_ key:String)->String{["jobs":"Zakázky","jobDay":"Můj den","jobList":"Seznam zakázek","customers":"Zákazníci","gardens":"Zahrady","attendance":"Docházka","materials":"Materiál","vehicles":"Vozidla","offline":"Offline režim","service":"Servis","shafts":"Šachty","blowout":"Vyfukování","plans":"Plány","gardenHistory":"Historie zahrady","defects":"Závady","notifications":"Upozornění","emailNotifications":"E-mailová upozornění","googleDrive":"Google Disk","drivePhotos":"Fotodokumentace zakázek","protocolPhotos":"Fotky protokolů","photoUploads":"Přidávání fotografií","subscriptions":"Servisní předplatné","jobMap":"Mapa zakázek","teamManagement":"Tým","backups":"Zálohy"][key] ?? key}}
