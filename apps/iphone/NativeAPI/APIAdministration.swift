import SwiftUI
import CryptoKit
import UniformTypeIdentifiers

struct APIOutboxView:View {
    @ObservedObject var store:APIStore
    @State private var file:APIFile?
    @State private var selected:APIMutation?
    @State private var discard=false
    var body:some View{List{Section{Text(store.online ? "Připojeno k serveru" : "Offline");Text("Změny jsou šifrované a oddělené podle účtu, firmy a oprávnění. Konflikt se nikdy nepřepíše automaticky.").font(.footnote);Button("Znovu ověřit spojení a synchronizovat"){Task{await store.resume()}}.disabled(store.syncing)}
        Section("Neodeslané změny"){if store.outbox.isEmpty{Text("Vše odesláno.")};ForEach(store.outbox){op in DisclosureGroup(op.state=="pending" ? "Čeká na odeslání" : op.state=="conflict" ? "Konflikt – nutná kontrola" : "Server změnu odmítl"){Text(op.path).font(.caption);if !op.error.isEmpty{Text(op.error).foregroundStyle(DiaryStyle.warning)};if let body=op.body{APIDataPairs(value:body,labels:["title":"Název","date":"Datum","work":"Práce","notes":"Poznámka","version":"Původní verze"])};Button("Exportovat tento zápis"){export(op)};Button("Zrušit odesílání této změny",role:.destructive){selected=op;discard=true}}}}
        Section("Rozepsané koncepty"){ForEach(Array((store.vault?.state.drafts ?? [:]).keys.sorted()),id:\.self){key in DisclosureGroup(key){Text("Koncept se nabídne při opětovném otevření stejného formuláře.").font(.footnote);Button("Exportovat koncept"){if let draft=store.vault?.state.drafts[key],let bytes=try? draft.value.data(){file=APIFile(url:APIImage.temporary(bytes,name:"Koncept.json"))}}}}}
        Section{Text("Před přechodem ze staré webové verze nejdříve odešlete její změny. Původní úložiště zůstává zachované; nová aplikace je sama nepřečte ani nesmaže.").font(.footnote)}
    }.navigationTitle("Koncepty a synchronizace").confirmationDialog("Zrušit odesílání? Uložený koncept zůstane zachovaný.",isPresented:$discard,titleVisibility:.visible){Button("Zrušit odesílání",role:.destructive){guard let selected,let vault=store.vault else{return};guard !store.outbox.contains(where:{$0.dependsOn.contains(selected.id)})else{store.error="Na tuto změnu navazuje jiný zápis. Nejprve zkontrolujte závislé změny.";return};vault.state.outbox.removeAll{$0.id==selected.id};if let key=selected.binaryKey{vault.removeBlob(key)};try? vault.persist();store.updateOutbox()};Button("Ponechat",role:.cancel){}}.sheet(item:$file){FileShare(url:$0.url)}}
    func export(_ op:APIMutation){var exported=op;exported.bytes=try? store.vault?.mutationBytes(op);if let bytes=try? JSONEncoder().encode(exported){file=APIFile(url:APIImage.temporary(bytes,name:"Neodeslana-zmena.json"))}}
}
struct APIRecordLinksView:View {
    @ObservedObject var store:APIStore
    @State private var records:[APIValue]=[]
    @State private var kind="all"
    @State private var cursor=""
    @State private var problem:String?
    var body:some View{List{Picker("Záznamy",selection:$kind){Text("Vše k ověření").tag("all");Text("Zahrady bez zákazníka").tag("garden");Text("Zakázky bez zahrady").tag("job");Text("Neplatné odkazy").tag("invalid")};Text("Shodné jméno ani adresa nejsou důvodem k automatickému propojení.").font(.footnote);ForEach(Array(records.enumerated()),id:\.offset){_,row in VStack(alignment:.leading){Text(row.title).font(.headline);APIDataPairs(value:row,labels:["address":"Adresa záznamu","customerName":"Zákazník","gardenName":"Zahrada","gardenAddress":"Adresa zahrady","reason":"Co chybí"]);Button("Otevřít a ručně upravit vazbu"){let entity:APIEntity=row["kind"].string=="garden" ? .gardens : .jobs;Task{do{let actual:APIValue;if entity == .jobs {actual=(try await store.get("/api/jobs/"+row.id))["job"]}else{actual=(try await store.get("/api/gardens"))["gardens"].array.first{$0.id==row.id} ?? .null};guard !actual.isNull else{throw APIError.local("Záznam už není dostupný.")};store.route=APIRoute(resource:APIResource(entity:entity),value:actual,isNew:false)}catch{problem=error.localizedDescription}}}}};if !cursor.isEmpty{Button("Další"){Task{await load(more:true)}}};if let problem{Text(problem)}}.navigationTitle("Kontrola vazeb").task(id:kind){await load()}}
    func load(more:Bool=false)async{do{let result=try await store.get("/api/record-links?kind="+kind+(more ? "&after="+cursor : ""));records=more ? records+result["records"].array : result["records"].array;cursor=result["nextCursor"].string;problem=nil}catch{problem=error.localizedDescription}}
}
enum APIJobPhotoUpload {
    @MainActor static func upload(store:APIStore,path:String,data:Data,type:String,name:String,id:String)async throws{
        let metadata:APIValue = .object(["id":.s(id),"category":.s("during"),"note":.s(""),"originalName":.s(name),"mimeType":.s(type),"size":.n(data.count),"sha256":.s(SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined())])
        guard store.enabled("googleDrive"),store.enabled("drivePhotos"),store.enabled("photoUploads")else{throw APIError.local("Nahrávání fotografií není povolené.")}
        if let vault=store.vault,store.enabled("offline"),vault.offlineAllowed(){try vault.enqueue(APIMutation(id:id,path:path,method:"DRIVE_PHOTO",body:metadata,bytes:data,contentType:type,headers:[:],scope:store.scope,dependsOn:[],draftKey:nil));store.updateOutbox();if store.online{await store.sync()}}
        else{try await send(store:store,path:path,data:data,metadata:metadata)}
    }
    @MainActor static func send(store:APIStore,path:String,data:Data,metadata:APIValue)async throws{
        var progress=try await store.transport.request(path,method:"POST",body:metadata)
        while !progress["complete"].bool{
            try Task.checkCancellation();let offset=progress["offset"].int
            guard offset>=0,offset<data.count else{throw APIError.local("Server vrátil neplatný stav nahrávání.")}
            let size=progress["chunkSize"].int>0 ? min(2*1024*1024,progress["chunkSize"].int) : 2*1024*1024
            let chunk=data.subdata(in:offset..<min(data.count,offset+size));let hash=SHA256.hash(data:chunk).map{String(format:"%02x",$0)}.joined()
            let response=try await store.transport.bytes(path+"/"+metadata.id+"/content?offset=\(offset)",method:"PUT",data:chunk,type:"application/octet-stream",headers:["x-chunk-sha256":hash]);progress=try JSONDecoder().decode(APIValue.self,from:response.data)
            guard progress["complete"].bool || progress["offset"].int>offset else{throw APIError.local("Nahrávání se zastavilo. Záznam zůstane pro bezpečné opakování.")}
        }
    }
}
struct APIDriveSettings:View {
    @ObservedObject var store:APIStore
    @State private var value:APIValue = .null
    @State private var config:APIValue = .object([:])
    @State private var problem:String?
    @State private var disconnect=false
    var body:some View{Form{Text("Google Disk slouží pouze jako úložiště souborů. Rozhraní deníku běží ve Swiftu.").font(.footnote);APIDataPairs(value:value,labels:["state":"Stav připojení","email":"Připojený účet","rootName":"Kořenová složka"]);if store.owner{DisclosureGroup("OAuth nastavení"){APIFieldsView(fields:[.text("clientId","Google Client ID",true),.field("clientSecret","Nový Client Secret",.password)],value:$config);Button("Uložit připojení"){Task{do{_ = try await store.write("/api/drive/config",method:"PUT",body:config.merged(["version":value["version"]]));config = .object([:]);await load()}catch{problem=error.localizedDescription}}}}};Text("Stávající připojení a fotografie zůstávají dostupné. Nové přihlášení ke Googlu vyžaduje nakonfigurované OAuth přesměrování pro nativní klient.").font(.footnote);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle("Google Disk").task{await load()}}
    func load()async{do{value=try await store.get("/api/drive/status")}catch{problem=error.localizedDescription}}
}
struct APIProtocolEmailView:View {
    @ObservedObject var store:APIStore
    let jobID:String
    let pdf:Data
    let jobVersion:APIValue
    let reportVersion:APIValue
    @State private var recipient=""
    @State private var requests:[APIValue]=[]
    @State private var problem:String?
    @State private var requestID=UUID().uuidString
    @State private var review:APIValue = .null
    @State private var approve=false
    var path:String{"/api/jobs/"+jobID+"/protocol-emails"}
    var body:some View{Form{TextField("E-mail zákazníka",text:$recipient).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never);Button("Připravit žádost ke schválení"){Task{await prepare()}};ForEach(requests,id:\.id){request in DisclosureGroup(request["recipient"].string+" · "+request["state"].string){Text(request["createdByName"].string);Button("Otevřít přesný PDF soubor ke kontrole"){Task{do{let r=try await store.file(path+"/"+request.id+"/pdf");share=APIFile(url:APIImage.temporary(r.data,name:"Vykaz.pdf"))}catch{problem=error.localizedDescription}}};if ["pending","failed"].contains(request["state"].string){Button("Schválit odeslání"){review=request;approve=true};Button("Zamítnout",role:.destructive){Task{await decide(request,action:"reject")}}}}};if let problem{Text(problem)}}.navigationTitle("Odeslání výkazu").task{await load()}.confirmationDialog("Odeslat zkontrolovaný výkaz zákazníkovi?",isPresented:$approve,titleVisibility:.visible){Button("Schválit a odeslat"){Task{await decide(review,action:review["state"].string=="failed" ? "retry" : "approve")}};Button("Zrušit",role:.cancel){}}.sheet(item:$share){APIQuickLook(url:$0.url)}}
    @State private var share:APIFile?
    func load()async{do{let r=try await store.get(path);requests=r["requests"].array}catch{problem=error.localizedDescription}}
    func prepare()async{do{var form=APIMultipart();form.field("metadata",String(data:try APIValue.object(["recipient":.s(recipient),"jobVersion":jobVersion,"reportVersion":reportVersion]).data(),encoding:.utf8)!);form.file("pdf",filename:"Vykaz.pdf",type:"application/pdf",bytes:pdf);try await store.upload(path+"/"+requestID,bytes:form.finished,type:form.type);requestID=UUID().uuidString;await load()}catch{problem=error.localizedDescription}}
    func decide(_ request:APIValue,action:String)async{do{_ = try await store.write(path+"/"+request.id+"/"+action,method:"POST",body:.object(["recipient":request["recipient"],"sha256":request["sha256"]]));await load()}catch{problem=error.localizedDescription}}
}
