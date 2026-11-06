import SwiftUI
import MapKit
import PhotosUI

struct APIMapPoint:Identifiable {let id:String;let name:String;let latitude:Double;let longitude:Double}
struct APIJobsMap:View {
    @ObservedObject var store:APIStore
    let jobs:[APIValue]
    @State private var points:[APIMapPoint]=[]
    @State private var missing:[String]=[]
    var body:some View{VStack{if store.manager{Map{ForEach(points){p in Annotation(p.name,coordinate:CLLocationCoordinate2D(latitude:p.latitude,longitude:p.longitude)){Image(systemName:"mappin.circle.fill").font(.title).foregroundStyle(DiaryStyle.accent)}}}.mapControls{MapCompass();MapScaleView()};if !missing.isEmpty{DisclosureGroup("\(missing.count) míst bez potvrzené polohy"){ScrollView{ForEach(missing,id:\.self){Text($0).font(.footnote)}}.frame(maxHeight:140)}.padding()};Text("Poloha je zobrazena pouze z uložených souřadnic. Vzdálenosti nejsou výpočtem trasy.").font(.caption).foregroundStyle(.secondary).padding()}else{ContentUnavailableView("Mapa je určena správci",systemImage:"lock")}}.navigationTitle("Mapa zakázek").task{guard store.manager else{return};do{let gardens=try await store.get("/api/gardens");var p:[APIMapPoint]=[];var m:[String]=[];for job in jobs{let garden=gardens["gardens"].array.first{$0.id==job["gardenId"].string};let candidates=garden?["geocode"]["candidates"].array ?? [];let location=job["position"].isNull ? (garden?["position"] ?? .null) : job["position"];let chosen=candidates.count==1 ? candidates[0] : location;let lat=chosen["latitude"].isNull ? chosen["lat"] : chosen["latitude"],lon=chosen["longitude"].isNull ? chosen["lon"] : chosen["longitude"];if !lat.isNull && !lon.isNull && abs(lat.double)<=90 && abs(lon.double)<=180{p.append(APIMapPoint(id:job.id,name:job["customerName"].string.isEmpty ? job.title : job["customerName"].string,latitude:lat.double,longitude:lon.double))}else{m.append(job.title+" · "+job["address"].string)}};points=p;missing=m}catch{store.error=error.localizedDescription}}}
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
    @State private var picked:PhotosPickerItem?
    @State private var zones:[APIValue]=[]
    @State private var zone=""
    @State private var problem:String?
    @State private var busy=false
    @State private var close=false
    @State private var refs:[String:[APIValue]]=[:]
    private var key:String{"shaft:"+initial.id}
    var body:some View{NavigationStack{Form{APIFieldsView(fields:[.text("name","Název šachty",true),.ref("gardenId","Zahrada","gardens"),.text("location","Přesné místo"),.field("notes","Poznámka",.notes)],value:$value,options:refs)
        if let image,let ui=UIImage(data:image){GeometryReader{geometry in Image(uiImage:ui).resizable().scaledToFit().frame(width:geometry.size.width,height:geometry.size.height).overlay{ForEach(Array(value["markers"].array.enumerated()),id:\.offset){index,m in Text(m["zoneName"].string).font(.caption.bold()).padding(5).background(.regularMaterial,in:Capsule()).position(x:m["x"].double*geometry.size.width,y:m["y"].double*geometry.size.height).gesture(DragGesture().onChanged{g in var rows=value["markers"].array;rows[index]["x"] = .number(min(1,max(0,g.location.x/geometry.size.width)));rows[index]["y"] = .number(min(1,max(0,g.location.y/geometry.size.height)));rows[index]["labelX"]=rows[index]["x"];rows[index]["labelY"]=rows[index]["y"];value["markers"] = .array(rows)})}}}.frame(height:280)}
        if store.enabled("photoUploads"){PhotosPicker("Vybrat fotografii",selection:$picked,matching:.images)}
        if !zones.isEmpty{Picker("Zóna",selection:$zone){Text("Vyberte zónu").tag("");ForEach(zones,id:\.id){Text($0.title).tag($0.id)}};Button("Přidat značku doprostřed fotografie"){guard let z=zones.first(where:{$0.id==zone})else{return};var markers=value["markers"].array;markers.append(.object(["id":.s(UUID().uuidString),"zoneId":.s(z.id),"zoneName":z["name"],"color":z["color"],"x":.number(0.5),"y":.number(0.5),"labelX":.number(0.5),"labelY":.number(0.5)]));value["markers"] = .array(markers)}.disabled(zone.isEmpty);ForEach(Array(value["markers"].array.enumerated()),id:\.offset){index,m in HStack{Text(m["zoneName"].string);Spacer();Button("Odebrat",role:.destructive){var rows=value["markers"].array;rows.remove(at:index);value["markers"] = .array(rows)}}}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle(isNew ? "Nová šachta" : "Upravit šachtu").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){close=true}};ToolbarItem(placement:.confirmationAction){Button("Uložit"){Task{await save()}}.disabled(busy)}}}.interactiveDismissDisabled().editLease(store).confirmationDialog("Nechat rozepsanou šachtu?",isPresented:$close){Button("Uložit koncept a zavřít"){persist();dismiss()};Button("Zahodit koncept",role:.destructive){store.removeDraft(key);dismiss()};Button("Pokračovat",role:.cancel){}}
        .onChange(of:value){_,_ in persist()}.onChange(of:picked){_,item in Task{if let d=try? await item?.loadTransferable(type:Data.self),let ui=UIImage(data:d){image=APIImage.jpeg(ui)};picked=nil}}
        .task{value=store.draft(key,fallback:initial.merged(["markers":initial["markers"].isNull ? .array([]) : initial["markers"]])).value;do{refs["gardens"]=try await APIDomainLogic.referenceRows("gardens",store:store);zones=(try await store.get("/api/zones"))["zones"].array;if !isNew{image=try await store.file("/api/shafts/"+initial.id+"/photo").data}}catch{problem=error.localizedDescription}}
    }
    func persist(){guard !value.isNull else{return};var draft=store.draft(key,fallback:initial);draft.value=value;draft.updatedAt=Date();store.saveDraft(key,draft:draft)}
    func save()async{busy=true;defer{busy=false};do{guard !value["name"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{throw APIError.local("Vyplňte název šachty.")};if isNew && image==nil{throw APIError.local("Nová šachta vyžaduje fotografii.")};var form=APIMultipart();form.field("record",String(data:try value.selecting(["version","name","gardenId","location","notes","markers","position"]).data(),encoding:.utf8)!);if let image{form.file("image",filename:"Sachta.jpg",type:"image/jpeg",bytes:image)};try await store.upload("/api/shafts/"+initial.id,bytes:form.finished,type:form.type);store.removeDraft(key);dismiss()}catch{problem=error.localizedDescription}}
}
struct APIPlanView:View {
    @ObservedObject var store:APIStore
    let garden:APIValue
    @State private var file:APIFile?
    @State private var value:APIValue = .null
    @State private var shaft=""
    @State private var shafts:[APIValue]=[]
    @State private var problem:String?
    var body:some View{ScrollView{VStack(alignment:.leading,spacing:16){if !value["plan"].isNull{Button("Zobrazit plán"){Task{do{let r=try await store.file("/api/gardens/"+garden.id+"/plan");file=APIFile(url:APIImage.temporary(r.data,name:value["plan"]["name"].string))}catch{problem=error.localizedDescription}}}.frame(minHeight:44);ForEach(Array(value["plan"]["markers"].array.enumerated()),id:\.offset){index,m in VStack{Text(shafts.first{$0.id==m["shaftId"].string}?.title ?? "Šachta");Slider(value:coordinate(index,"x"),in:0...1){Text("Vodorovná poloha")};Slider(value:coordinate(index,"y"),in:0...1){Text("Svislá poloha")};Button("Odebrat značku",role:.destructive){var plan=value["plan"];var markers=plan["markers"].array;markers.remove(at:index);plan["markers"] = .array(markers);value["plan"]=plan}}.diaryCard()};if store.writer{Picker("Šachta",selection:$shaft){Text("Vyberte šachtu").tag("");ForEach(shafts,id:\.id){Text($0.title).tag($0.id)}};Button("Přidat značku"){guard !shaft.isEmpty else{return};var markers=value["plan"]["markers"].array;guard !markers.contains(where:{$0["shaftId"].string==shaft})else{return};markers.append(.object(["shaftId":.s(shaft),"x":.number(0.5),"y":.number(0.5)]));value["plan"]["markers"] = .array(markers)};Button("Uložit umístění"){Task{await save()}}}}else{Text("Zahrada zatím nemá nahraný plán.")};APIFilesView(store:store,path:"/api/gardens/"+garden.id+"/plan",mode:.plan,record:value);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.padding(18)}.navigationTitle("Plán zahrady").sheet(item:$file){APIQuickLook(url:$0.url)}.task{await load()}.onChange(of:store.revision){_,_ in Task{await load()}}}
    func coordinate(_ index:Int,_ key:String)->Binding<Double>{Binding(get:{value["plan"]["markers"].array[index][key].double},set:{v in var markers=value["plan"]["markers"].array;markers[index][key] = .number(v);value["plan"]["markers"] = .array(markers)})}
    func load()async{do{value=(try await store.get("/api/gardens"))["gardens"].array.first{$0.id==garden.id} ?? garden;shafts=(try await store.get("/api/shafts"))["records"].array.filter{$0["gardenId"].string==garden.id}}catch{problem=error.localizedDescription}}
    func save()async{do{_ = try await store.write("/api/gardens/"+garden.id+"/plan-markers",method:"PUT",body:.object(["version":value["version"],"planVersion":value["plan"]["version"],"markers":value["plan"]["markers"]]));await load()}catch{problem=error.localizedDescription}}
}
struct APIBlowoutView:View {
    @ObservedObject var store:APIStore
    let garden:APIValue
    @State private var value:APIValue = .null
    @State private var picked:PhotosPickerItem?
    @State private var selectedStep:Int?
    @State private var images:[String:Data]=[:]
    @State private var problem:String?
    @State private var busy=false
    private var key:String{"blowout:"+garden.id}
    var body:some View{Form{ForEach(Array(value["steps"].array.enumerated()),id:\.offset){index,step in DisclosureGroup(step["title"].string){TextField("Název kroku",text:binding(index,"title"));TextEditor(text:binding(index,"notes")).frame(minHeight:90);ForEach(step["photos"].array,id:\.id){photo in if let bytes=images[photo.id],let image=UIImage(data:bytes){Image(uiImage:image).resizable().scaledToFit()}else{APIAuthenticatedImage(store:store,path:"/api/gardens/"+garden.id+"/blowout/photos/"+photo.id)}};if store.writer&&store.enabled("photoUploads"){PhotosPicker("Přidat fotografii",selection:$picked,matching:.images).simultaneousGesture(TapGesture().onEnded{selectedStep=index})}}};if store.writer{Button("Přidat vlastní krok"){var steps=value["steps"].array;steps.append(.object(["id":.s(UUID().uuidString),"title":.s("Další krok"),"notes":.s(""),"photos":.array([])]));value["steps"] = .array(steps)};Button("Uložit postup"){Task{await save()}}.disabled(busy)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle("Vyfukování").task{do{let result=try await store.get("/api/gardens/"+garden.id+"/blowout");value=store.draft(key,fallback:result).value}catch{problem=error.localizedDescription}}.onChange(of:value){_,v in guard !v.isNull else{return};var draft=store.draft(key,fallback:v);draft.value=v;store.saveDraft(key,draft:draft)}.onChange(of:picked){_,item in Task{if let index=selectedStep,let data=try? await item?.loadTransferable(type:Data.self),let image=UIImage(data:data),let bytes=APIImage.jpeg(image){let id=UUID().uuidString;images[id]=bytes;var steps=value["steps"].array;var photos=steps[index]["photos"].array;photos.append(.object(["id":.s(id)]));steps[index]["photos"] = .array(photos);value["steps"] = .array(steps)};picked=nil}}}
    func binding(_ index:Int,_ key:String)->Binding<String>{Binding(get:{value["steps"].array[index][key].string},set:{v in var rows=value["steps"].array;rows[index][key] = .s(v);value["steps"] = .array(rows)})}
    func save()async{busy=true;defer{busy=false};do{var form=APIMultipart();form.field("document",String(data:try value.selecting(["version","steps"]).data(),encoding:.utf8)!);for(id,data)in images{form.file("photo:"+id,filename:id+".jpg",type:"image/jpeg",bytes:data)};try await store.upload("/api/gardens/"+garden.id+"/blowout",bytes:form.finished,type:form.type);store.removeDraft(key);images=[:];value=try await store.get("/api/gardens/"+garden.id+"/blowout");problem="Uloženo."}catch{problem=error.localizedDescription}}
}
