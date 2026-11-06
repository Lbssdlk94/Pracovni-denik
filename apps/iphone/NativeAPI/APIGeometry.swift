import SwiftUI
import MapKit
import PhotosUI
import CryptoKit

struct APIMapPoint:Identifiable {
    let id:String
    let job:APIValue
    let candidate:APIValue
    let confirmed:Bool
    var position:CLLocationCoordinate2D{CLLocationCoordinate2D(latitude:candidate["position"]["latitude"].double,longitude:candidate["position"]["longitude"].double)}
}
struct APIMapGroup:Identifiable {
    let id:String
    let points:[APIMapPoint]
    var position:CLLocationCoordinate2D{points[0].position}
}
enum APIPlaces {
    static func normalize(_ value:String)->String{value.precomposedStringWithCompatibilityMapping.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:"\\s+",with:" ",options:.regularExpression).lowercased(with:Locale(identifier:"cs_CZ"))}
    static func address(_ job:APIValue)->String{let address=job["address"].string,city=job["city"].string;guard !address.isEmpty else{return ""};return [address,!city.isEmpty && !normalize(address).components(separatedBy:",").map{$0.trimmingCharacters(in:.whitespaces)}.contains(normalize(city)) ? city : ""].filter{!$0.isEmpty}.joined(separator:", ")}
    static func valid(_ candidate:APIValue)->Bool{let p=candidate["position"];return !p["latitude"].isNull && !p["longitude"].isNull && abs(p["latitude"].double)<=90 && abs(p["longitude"].double)<=180}
    static func automatic(_ values:[APIValue],addressOnly:Bool)->APIValue?{guard let first=values.first,valid(first),["address","street"].contains(first["precision"].string),!addressOnly || first["precision"].string=="address"else{return nil};let p=CLLocation(latitude:first["position"]["latitude"].double,longitude:first["position"]["longitude"].double);guard values.allSatisfy({valid($0) && p.distance(from:CLLocation(latitude:$0["position"]["latitude"].double,longitude:$0["position"]["longitude"].double))<250})else{return nil};return first}
    static func points(_ jobs:[APIValue])->[APIMapGroup]{var groups:[String:[APIMapPoint]]=[:];for job in jobs{let geo=job["geocode"];guard geo["address"].string==normalize(address(job))else{continue};let candidates=geo["candidates"].array.filter{valid($0)};let selected=candidates.first{$0.id==geo["selectedId"].string} ?? automatic(candidates,addressOnly:true);for candidate in selected.map({[$0]}) ?? candidates{let p=APIMapPoint(id:job.id+":"+candidate.id,job:job,candidate:candidate,confirmed:selected != nil);let key=String(format:"%.6f,%.6f",p.position.latitude,p.position.longitude);groups[key,default:[]].append(p)}};return groups.keys.sorted().map{APIMapGroup(id:$0,points:groups[$0]!)}}
    static func distance(_ garden:APIValue,from position:CLLocation?)->String?{guard let position,garden["geocode"]["address"].string==normalize(garden["address"].string),let candidate=automatic(garden["geocode"]["candidates"].array,addressOnly:false)else{return nil};let meters=position.distance(from:CLLocation(latitude:candidate["position"]["latitude"].double,longitude:candidate["position"]["longitude"].double));return meters<1000 ? "≈ \(Int(meters.rounded())) m" : String(format:"≈ %.1f km",meters/1000)}
}
struct APIJobsMap:View {
    @ObservedObject var store:APIStore
    let jobs:[APIValue]
    @State private var rows:[APIValue]=[]
    @State private var selected:APIMapGroup?
    @State private var problem:String?
    @State private var busy=false
    private var groups:[APIMapGroup]{APIPlaces.points(rows)}
    var body:some View{
        VStack(spacing:0){
            if store.manager{
                Map{ForEach(groups){group in
                    Annotation(group.points.count>1 ? "\(group.points.count) zakázky" : group.points[0].job["customerName"].string,coordinate:group.position){
                        Button{selected=group}label:{Image(systemName:group.points.allSatisfy(\.confirmed) ? "mappin.circle.fill" : "questionmark.circle.fill").font(.largeTitle).foregroundStyle(group.points.allSatisfy(\.confirmed) ? DiaryStyle.accent : DiaryStyle.warning)}
                    }
                }}.mapControls{MapCompass();MapScaleView()}
                DisclosureGroup("Upřesnění míst · \(rows.count) zakázek"){
                    ScrollView{VStack(alignment:.leading,spacing:12){ForEach(rows,id:\.id){job in
                        VStack(alignment:.leading){Text(job["customerName"].string.isEmpty ? job.title : job["customerName"].string).font(.headline);Text(APIPlaces.address(job)).font(.caption);if job["geocode"]["candidates"].array.isEmpty{Button("Dohledat adresu"){Task{await locate(job)}}.disabled(busy)}else{ForEach(job["geocode"]["candidates"].array,id:\.id){candidate in Button((candidate.id==job["geocode"]["selectedId"].string ? "✓ " : "")+candidate["label"].string){Task{await choose(job,candidate:candidate)}}.frame(minHeight:44)}}}
                    }}}.frame(maxHeight:230)
                }.padding(12)
                if let problem{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning).padding(8)}
                Text("Neověřená místa označuje otazník. Body na stejné adrese jsou seskupené.").font(.caption).foregroundStyle(.secondary).padding(8)
            }else{ContentUnavailableView("Mapa je určena správci",systemImage:"lock")}
        }.navigationTitle("Mapa zakázek").task{rows=jobs}.sheet(item:$selected){group in NavigationStack{List(group.points){point in NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:point.job)}label:{VStack(alignment:.leading){Text(point.job["customerName"].string).font(.headline);Text(point.job.title).font(.subheadline);Text(point.confirmed ? "Potvrzené místo" : "Místo je třeba upřesnit").font(.caption)}}}.navigationTitle("Zakázky na místě")}}
    }
    func locate(_ job:APIValue)async{busy=true;defer{busy=false};do{let result=try await store.write("/api/jobs/"+job.id+"/geocode",method:"POST",body:.object(["address":.s(APIPlaces.normalize(APIPlaces.address(job)))]));if let index=rows.firstIndex(where:{$0.id==job.id}){rows[index]["geocode"]=result["geocode"]};problem=nil}catch{problem=error.localizedDescription}}
    func choose(_ job:APIValue,candidate:APIValue)async{do{let result=try await store.write("/api/jobs/"+job.id+"/geocode",method:"PUT",body:.object(["address":job["geocode"]["address"],"version":job["geocode"]["version"],"selectedId":.s(candidate.id)]));if let index=rows.firstIndex(where:{$0.id==job.id}){rows[index]["geocode"]=result["geocode"]};problem=nil}catch{problem=error.localizedDescription}}
}
struct APIZonesView:View {
    @ObservedObject var store:APIStore
    @State private var value:APIValue = .object(["zones":.array([])])
    @State private var version:APIValue = .n(0)
    @State private var problem:String?
    var body:some View{Form{APIFieldsView(fields:[.array("zones","Zóny",[.text("name","Název",true),.text("color","Barva #RRGGBB",true)])],value:$value);if let problem{Text(problem)};Button("Uložit zóny"){Task{do{_ = try await store.write("/api/zones",method:"PUT",body:value.merged(["version":version]));await load();problem="Uloženo."}catch{problem=error.localizedDescription}}}}.navigationTitle("Zóny závlahy").task{await load()}}
    func load()async{do{let r=try await store.get("/api/zones");version=r["version"];value = .object(["zones":r["zones"]])}catch{problem=error.localizedDescription}}
}
struct APIShaftEditor:View {
    @ObservedObject var store:APIStore
    let initial:APIValue
    let isNew:Bool
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .null
    @State private var image:Data?
    @State private var remote:APIValue = .null
    @State private var reviewed=false
    @State private var imageChanged=false
    @State private var baseline:APIValue = .null
    @StateObject private var location=APILocation()
    @State private var picked:PhotosPickerItem?
    @State private var zones:[APIValue]=[]
    @State private var zone=""
    @State private var problem:String?
    @State private var busy=false
    @State private var close=false
    @State private var refs:[String:[APIValue]]=[:]
    private var key:String{"shaft:"+initial.id}
    var body:some View{NavigationStack{Form{APIFieldsView(fields:[.text("name","Název šachty",true),.ref("gardenId","Zahrada","gardens"),.text("location","Přesné místo"),.field("notes","Poznámka",.notes)],value:$value,options:refs)
        if let image,let ui=APIImage.thumbnail(image){APIShaftCanvas(image:ui,markers:Binding(get:{value["markers"]},set:{value["markers"]=$0}),editable:true)}
        if store.enabled("location"){Button("Uložit aktuální polohu šachty"){Task{if let point=await location.capture(){value["position"]=APILocation.json(point)}}}}
        if store.enabled("photoUploads"){PhotosPicker("Vybrat fotografii",selection:$picked,matching:.images)}
        if !zones.isEmpty{Picker("Zóna",selection:$zone){Text("Vyberte zónu").tag("");ForEach(zones,id:\.id){Text($0.title).tag($0.id)}};Button("Přidat značku doprostřed fotografie"){guard let z=zones.first(where:{$0.id==zone})else{return};var markers=value["markers"].array;markers.append(.object(["id":.s(UUID().uuidString),"zoneId":.s(z.id),"zoneName":z["name"],"color":z["color"],"x":.number(0.5),"y":.number(0.5),"labelX":.number(0.5),"labelY":.number(0.5)]));value["markers"] = .array(markers)}.disabled(zone.isEmpty);ForEach(Array(value["markers"].array.enumerated()),id:\.offset){index,m in HStack{Text(m["zoneName"].string);Spacer();Button("Odebrat",role:.destructive){var rows=value["markers"].array;rows.remove(at:index);value["markers"] = .array(rows)}}}}
        if store.outbox.contains(where:{$0.path=="/api/shafts/"+initial.id && $0.state=="conflict"}){Button("Zkontrolovat konflikt se serverem"){Task{do{let page=try await store.get("/api/shafts");guard let record=page["records"].array.first(where:{$0.id==initial.id})else{throw APIError.local("Aktuální šachta není dostupná. Místní koncept lze exportovat.")};remote=record;reviewed=false}catch{problem=error.localizedDescription}}}}
        if !remote.isNull{DisclosureGroup("Aktuální stav na serveru"){APIReadFields(value:remote,fields:APIResource(entity:.shafts).fields);APIAuthenticatedImage(store:store,path:"/api/shafts/"+initial.id+"/photo",version:remote["imageVersion"])};Toggle("Zkontrolováno – použít mé údaje a fotografii",isOn:$reviewed);Button("Uložit po ruční kontrole"){Task{await resolveConflict()}}.disabled(!reviewed)}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle(isNew ? "Nová šachta" : "Upravit šachtu").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){close=true}};ToolbarItem(placement:.confirmationAction){Button("Uložit"){Task{await save()}}.disabled(busy)}}}.interactiveDismissDisabled().editLease(store).confirmationDialog("Nechat rozepsanou šachtu?",isPresented:$close){Button("Uložit koncept a zavřít"){persist();dismiss()};Button("Zahodit koncept",role:.destructive){store.removeDraft(key);store.vault?.removeBlob("shaft-draft:"+key);dismiss()};Button("Pokračovat",role:.cancel){}}
        .onChange(of:value){_,_ in persist()}.onChange(of:picked){_,item in Task{if let d=try? await item?.loadTransferable(type:Data.self),let ui=UIImage(data:d){image=APIImage.jpeg(ui);imageChanged=true;if let image{value["_localImageDigest"] = .s(SHA256.hash(data:image).map{String(format:"%02x",$0)}.joined());try? store.vault?.saveBlob(image,path:"shaft-draft:"+key)}};picked=nil}}
        .task{baseline=initial;value=store.draft(key,fallback:initial.merged(["markers":initial["markers"].isNull ? .array([]) : initial["markers"]])).value;do{refs["gardens"]=try await APIDomainLogic.referenceRows("gardens",store:store);zones=(try? await store.get("/api/zones"))?["zones"].array ?? [];if let local=try store.vault?.blob("shaft-draft:"+key){image=local;imageChanged=true}else if !isNew{image=try await store.file("/api/shafts/"+initial.id+"/photo",version:initial["imageVersion"]).data}}catch{problem=error.localizedDescription}}
    }
    func persist(){guard store.writer,!value.isNull,isNew || value != baseline else{return};var draft=store.draft(key,fallback:initial);draft.value=value;draft.updatedAt=Date();store.saveDraft(key,draft:draft)}
    func save()async{busy=true;defer{busy=false};do{guard !value["name"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{throw APIError.local("Vyplňte název šachty.")};if isNew && image==nil{throw APIError.local("Nová šachta vyžaduje fotografii.")};if value["gardenId"].string.isEmpty{value["gardenId"] = .null};var form=APIMultipart();form.field("record",String(data:try value.selecting(["version","name","gardenId","location","notes","markers","position"]).data(),encoding:.utf8)!);if let image,isNew || imageChanged{form.file("image",filename:"Sachta.jpg",type:"image/jpeg",bytes:image)};let draft=store.draft(key,fallback:value);if store.outbox.contains(where:{$0.id==draft.operationID}){throw APIError.local("Tato šachta už čeká na synchronizaci. Zkontrolujte ji v Konceptech a synchronizaci.")};try await store.upload("/api/shafts/"+initial.id,bytes:form.finished,type:form.type,offline:true,id:draft.operationID,draftKey:key);if !store.outbox.contains(where:{$0.id==draft.operationID}){store.removeDraft(key);store.vault?.removeBlob("shaft-draft:"+key)};dismiss()}catch{problem=error.localizedDescription}}
    func resolveConflict()async{guard reviewed,!remote.isNull,let vault=store.vault else{return};do{let conflicts=vault.state.outbox.filter{$0.path=="/api/shafts/"+initial.id && $0.state=="conflict"};guard !conflicts.isEmpty else{throw APIError.local("Konflikt se mezitím změnil.")};value["version"]=remote["version"];vault.state.drafts[key]=APIDraft(value:value,baseVersion:remote["version"].int,operationID:UUID().uuidString,updatedAt:Date());vault.state.outbox.removeAll{op in conflicts.contains{$0.id==op.id}};try vault.persist();for op in conflicts{if let blob=op.binaryKey{vault.removeBlob(blob)}};store.updateOutbox();remote = .null;reviewed=false;await save()}catch{problem=error.localizedDescription}}

}
struct APIPlanView:View {
    @ObservedObject var store:APIStore
    let garden:APIValue
    @State private var file:APIFile?
    @State private var value:APIValue = .null
    @State private var baseline:APIValue = .null
    @State private var shaft=""
    @State private var shafts:[APIValue]=[]
    @State private var problem:String?
    @State private var discard=false
    private var key:String{"plan:"+garden.id}
    private var dirty:Bool{!value.isNull && value != baseline}
    var body:some View{ScrollView{VStack(alignment:.leading,spacing:16){
        if !value["plan"].isNull{
            Button("Zobrazit plán"){Task{await preview()}}.frame(minHeight:44)
            ForEach(Array(value["plan"]["markers"].array.enumerated()),id:\.offset){index,marker in
                VStack(alignment:.leading){Text(shafts.first{$0.id==marker["shaftId"].string}?.title ?? "Šachta").font(.headline)
                    if store.writer{Slider(value:coordinate(index,"x"),in:0...1){Text("Vodorovná poloha")};Slider(value:coordinate(index,"y"),in:0...1){Text("Svislá poloha")};Button("Odebrat značku",role:.destructive){var markers=value["plan"]["markers"].array;markers.remove(at:index);value["plan"]["markers"] = .array(markers)}}
                }.diaryCard()
            }
            if store.writer{
                Picker("Šachta",selection:$shaft){Text("Vyberte šachtu").tag("");ForEach(shafts,id:\.id){Text($0.title).tag($0.id)}}
                Button("Přidat značku"){guard !shaft.isEmpty else{return};var markers=value["plan"]["markers"].array;guard !markers.contains(where:{$0["shaftId"].string==shaft})else{return};markers.append(.object(["shaftId":.s(shaft),"x":.number(0.5),"y":.number(0.5)]));value["plan"]["markers"] = .array(markers)}
                Button("Uložit umístění"){Task{await save()}}.buttonStyle(.borderedProminent)
            }
        }else{Text("Zahrada zatím nemá nahraný plán.")}
        APIFilesView(store:store,path:"/api/gardens/"+garden.id+"/plan",mode:.plan,record:value).disabled(dirty)
        if dirty{Text("Před výměnou plánu uložte umístění značek. Rozepsané změny zůstávají v tomto iPhonu.").font(.footnote);Button("Zahodit koncept a načíst aktuální plán",role:.destructive){discard=true}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.padding(18)}.navigationTitle("Plán zahrady").sheet(item:$file){APIQuickLook(url:$0.url)}.task{await load(restore:true)}.onChange(of:store.revision){_,_ in if !dirty{Task{await load(restore:false)}}}.onChange(of:value){_,v in if dirty && store.writer{var draft=store.draft(key,fallback:baseline);draft.value=v;draft.updatedAt=Date();store.saveDraft(key,draft:draft)}}.confirmationDialog("Zahodit pouze místní rozpracované umístění značek?",isPresented:$discard,titleVisibility:.visible){Button("Zahodit místní koncept",role:.destructive){store.removeDraft(key);Task{await load(restore:false)}};Button("Ponechat",role:.cancel){}}}
    func coordinate(_ index:Int,_ key:String)->Binding<Double>{Binding(get:{let markers=value["plan"]["markers"].array;return markers.indices.contains(index) ? markers[index][key].double : 0.5},set:{v in var markers=value["plan"]["markers"].array;guard markers.indices.contains(index)else{return};markers[index][key] = .number(v);value["plan"]["markers"] = .array(markers)})}
    func load(restore:Bool)async{do{let page=try await store.get("/api/gardens");guard let current=page["gardens"].array.first(where:{$0.id==garden.id})else{throw APIError.local("Zahrada není dostupná.")};baseline=current;value=restore ? store.draft(key,fallback:current).value : current;if store.enabled("shafts"){shafts=(try await store.get("/api/shafts"))["records"].array.filter{$0["gardenId"].string==garden.id}};problem=nil}catch{problem=error.localizedDescription}}
    func save()async{do{let result=try await store.write("/api/gardens/"+garden.id+"/plan-markers",method:"PUT",body:.object(["version":value["version"],"planVersion":value["plan"]["version"],"markers":value["plan"]["markers"]]));store.removeDraft(key);if !result["garden"].isNull{baseline=result["garden"];value=baseline}else{await load(restore:false)};problem="Uloženo."}catch{problem=error.localizedDescription}}
    func preview()async{do{let result=try await store.file("/api/gardens/"+garden.id+"/plan",version:value["plan"]["version"]);file=APIFile(url:APIImage.temporary(result.data,name:value["plan"]["name"].string))}catch{problem=error.localizedDescription}}
}
struct APIBlowoutView:View {
    @ObservedObject var store:APIStore
    let garden:APIValue
    @State private var value:APIValue = .null
    @State private var picked:PhotosPickerItem?
    @State private var blowoutBase:APIValue = .null
    @State private var selectedStep:Int?
    @State private var images:[String:Data]=[:]
    @State private var problem:String?
    @State private var busy=false
    private var key:String{"blowout:"+garden.id}
    var body:some View{Form{ForEach(Array(value["steps"].array.enumerated()),id:\.offset){index,step in DisclosureGroup(step["title"].string){TextField("Název kroku",text:binding(index,"title"));TextEditor(text:binding(index,"notes")).frame(minHeight:90);ForEach(step["photos"].array,id:\.id){photo in if let bytes=images[photo.id],let image=UIImage(data:bytes){Image(uiImage:image).resizable().scaledToFit()}else{APIAuthenticatedImage(store:store,path:"/api/gardens/"+garden.id+"/blowout/photos/"+photo.id)}};if store.writer&&store.enabled("photoUploads"){PhotosPicker("Přidat fotografii",selection:$picked,matching:.images).simultaneousGesture(TapGesture().onEnded{selectedStep=index})}}};if store.writer{Button("Přidat vlastní krok"){var steps=value["steps"].array;steps.append(.object(["id":.s(UUID().uuidString),"title":.s("Další krok"),"notes":.s(""),"photos":.array([])]));value["steps"] = .array(steps)};Button("Uložit postup"){Task{await save()}}.disabled(busy)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle("Vyfukování").task{do{let result=try await store.get("/api/gardens/"+garden.id+"/blowout");blowoutBase=result;value=store.draft(key,fallback:result).value;for step in value["steps"].array{for photo in step["photos"].array{if let bytes=try store.vault?.blob("blowout:"+garden.id+":"+photo.id){images[photo.id]=bytes}}}}catch{problem=error.localizedDescription}}.onChange(of:value){_,v in guard store.writer,!v.isNull,v != blowoutBase else{return};var draft=store.draft(key,fallback:v);draft.value=v;store.saveDraft(key,draft:draft)}.onChange(of:picked){_,item in Task{if let index=selectedStep,let data=try? await item?.loadTransferable(type:Data.self),let image=UIImage(data:data),let bytes=APIImage.jpeg(image){let id=UUID().uuidString;try? store.vault?.saveBlob(bytes,path:"blowout:"+garden.id+":"+id);images[id]=bytes;var steps=value["steps"].array;var photos=steps[index]["photos"].array;photos.append(.object(["id":.s(id)]));steps[index]["photos"] = .array(photos);value["steps"] = .array(steps)};picked=nil}}}
    func binding(_ index:Int,_ key:String)->Binding<String>{Binding(get:{value["steps"].array[index][key].string},set:{v in var rows=value["steps"].array;rows[index][key] = .s(v);value["steps"] = .array(rows)})}
    func save()async{busy=true;defer{busy=false};do{var form=APIMultipart();form.field("document",String(data:try value.selecting(["version","steps"]).data(),encoding:.utf8)!);for(id,data)in images{form.file("photo:"+id,filename:id+".jpg",type:"image/jpeg",bytes:data)};try await store.upload("/api/gardens/"+garden.id+"/blowout",bytes:form.finished,type:form.type);store.removeDraft(key);for id in images.keys{store.vault?.removeBlob("blowout:"+garden.id+":"+id)};images=[:];let result=try await store.get("/api/gardens/"+garden.id+"/blowout");blowoutBase=result;value=result;problem="Uloženo."}catch{problem=error.localizedDescription}}
}
