import SwiftUI
import PhotosUI
import UIKit
import QuickLook
import MapKit
import UniformTypeIdentifiers
import ImageIO

struct APIFile:Identifiable { let id=UUID();let url:URL }
struct APIMultipart {
    let boundary="Diary-"+UUID().uuidString
    var data=Data()
    mutating func field(_ name:String,_ value:String) { data.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8)) }
    mutating func file(_ name:String,filename:String,type:String,bytes:Data) { data.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename.replacingOccurrences(of:"\"",with:"").replacingOccurrences(of:"\r",with:"").replacingOccurrences(of:"\n",with:""))\"\r\nContent-Type: \(type)\r\n\r\n".utf8));data.append(bytes);data.append(Data("\r\n".utf8)) }
    var finished:Data { var d=data;d.append(Data("--\(boundary)--\r\n".utf8));return d }
    var type:String { "multipart/form-data; boundary="+boundary }
}
struct APIAuthenticatedImage:View {
    @ObservedObject var store:APIStore
    let path:String
    var version:APIValue = .null
    var maxPixels=1600
    var fallbackPath=""
    @State private var thumbnail:UIImage?
    @State private var problem:String?
    var body:some View {
        Group {
            if let thumbnail{Image(uiImage:thumbnail).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius:18))}
            else if let problem{Text(problem).font(.footnote).foregroundStyle(.secondary)}
            else{ProgressView("Načítám fotografii…")}
        }.task(id:store.scope+path+version.string){
            let scope=store.scope;thumbnail=nil;problem=nil
            do{
                let r:APIBytes
                do{r=try await store.file(path,version:version)}catch let error as APIError where error.status==404 && !fallbackPath.isEmpty && fallbackPath != path{r=try await store.file(fallbackPath,version:version)}
                guard scope==store.scope else{return}
                guard let image=APIImage.thumbnail(r.data,maxPixels:maxPixels)else{throw APIError.local("Náhled fotografie nelze otevřít.")}
                thumbnail=image
            }catch{if scope==store.scope{thumbnail=nil;problem=error.localizedDescription}}
        }
    }
}
struct APIQuickLook:UIViewControllerRepresentable {
    let url:URL
    func makeCoordinator()->Coordinator {Coordinator(url:url)}
    func makeUIViewController(context:Context)->QLPreviewController {let c=QLPreviewController();c.dataSource=context.coordinator;return c}
    func updateUIViewController(_ c:QLPreviewController,context:Context){}
    final class Coordinator:NSObject,QLPreviewControllerDataSource {let url:URL;init(url:URL){self.url=url};func numberOfPreviewItems(in controller:QLPreviewController)->Int{1};func previewController(_ controller:QLPreviewController,previewItemAt index:Int)->QLPreviewItem{url as NSURL}}
}
struct APICamera:UIViewControllerRepresentable {
    var selected:(Data)->Void
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator()->Coordinator{Coordinator(parent:self)}
    func makeUIViewController(context:Context)->UIImagePickerController{let c=UIImagePickerController();c.sourceType = .camera;c.delegate=context.coordinator;return c}
    func updateUIViewController(_ c:UIImagePickerController,context:Context){}
    final class Coordinator:NSObject,UINavigationControllerDelegate,UIImagePickerControllerDelegate {let parent:APICamera;init(parent:APICamera){self.parent=parent};func imagePickerControllerDidCancel(_ picker:UIImagePickerController){parent.dismiss()};func imagePickerController(_ picker:UIImagePickerController,didFinishPickingMediaWithInfo info:[UIImagePickerController.InfoKey:Any]){if let image=info[.originalImage] as? UIImage,let data=APIImage.jpeg(image){parent.selected(data)};parent.dismiss()}}
}
enum APIImage {
    static func thumbnail(_ data:Data,maxPixels:Int=1600)->UIImage?{guard let source=CGImageSourceCreateWithData(data as CFData,nil),let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:maxPixels] as CFDictionary)else{return nil};return UIImage(cgImage:image)}
    static func jpeg(_ image:UIImage)->Data? {
        let pixels=CGSize(width:image.size.width*image.scale,height:image.size.height*image.scale)
        guard pixels.width.isFinite,pixels.height.isFinite,pixels.width>0,pixels.height>0 else{return nil}
        let scale=min(1,2048/max(pixels.width,pixels.height))
        let size=CGSize(width:max(1,pixels.width*scale),height:max(1,pixels.height*scale))
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        let reduced=UIGraphicsImageRenderer(size:size,format:format).image{context in UIColor.white.setFill();context.fill(CGRect(origin:.zero,size:size));image.draw(in:CGRect(origin:.zero,size:size))}
        var encoded:Data?
        for quality in [0.82,0.74,0.66]{encoded=reduced.jpegData(compressionQuality:quality);if let encoded,encoded.count<=800*1024{return encoded}}
        return encoded
    }
    static func prepared(_ data:Data,type:String)throws -> (data:Data,type:String,extensionName:String){
        guard data.count<=100*1024*1024,let image=thumbnail(data,maxPixels:2048)else{throw APIError.local("Fotografii nelze otevřít nebo je příliš velká.")}
        if type=="image/png",let cg=image.cgImage,[CGImageAlphaInfo.first,.last,.premultipliedFirst,.premultipliedLast].contains(cg.alphaInfo),let png=image.pngData(){
            return (png.count<data.count ? png : data,"image/png","png")
        }
        if type=="image/jpeg",data.count<350*1024,let source=CGImageSourceCreateWithData(data as CFData,nil),let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],let width=properties[kCGImagePropertyPixelWidth] as? Int,let height=properties[kCGImagePropertyPixelHeight] as? Int,max(width,height)<=2048{return (data,type,"jpg")}
        guard let jpeg=jpeg(image)else{throw APIError.local("Fotografii nelze zmenšit.")}
        return (jpeg,"image/jpeg","jpg")
    }
    static func temporary(_ data:Data,name:String)->URL {let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true);try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true);let url=directory.appendingPathComponent(name.replacingOccurrences(of:"/",with:"_"));try? data.write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]);return url}
}
struct APIFilesView:View {
    enum Mode {case vehicle,receipts,service,diary,job,plan}
    @ObservedObject var store:APIStore
    let path:String
    let mode:Mode
    let record:APIValue
    var attached:((String)->Void)? = nil
    var selection:Binding<APIValue>? = nil
    var selectionLabel="Zahrnout do protokolu"
    @State private var picked:[PhotosPickerItem]=[]
    @State private var camera=false
    @State private var importing=false
    @State private var files:[APIValue]=[]
    @State private var problem:String?
    @State private var busy=false
    @State private var category="during"
    @State private var note=""
    @State private var photoAction:APIDomainAction?
    @State private var removePhoto:APIValue = .null
    @State private var confirmRemoval=false
    var allowed:Bool { (store.writer || mode == .diary && APIJobWorkflow.diaryRole(store.role)) && !store.isRolePreview && !record["cancelled"].bool && store.enabled("photoUploads") && (![Mode.service,.diary].contains(mode) || store.enabled("protocolPhotos")) && (mode != .receipts || store.enabled("fleetReceipts") && (store.manager || record["createdBy"].string==store.userID)) && (mode != .job || store.enabled("drivePhotos")) }
    var body:some View {
        VStack(alignment:.leading,spacing:12) {
            if mode != .vehicle && mode != .plan {
                APIPhotoGrid(store:store,photos:files.map{file in
                    let content=APIPhotoPaths.content(path:path,file:file,jobGallery:mode == .job)
                    return file.merged(["name":.s(file["name"].string.isEmpty ? file["fileName"].string : file["name"].string),"url":.s(mode == .receipts ? path+"/"+file.id : content),"previewUrl":.s(mode == .job ? path+"/"+file.id+"/thumbnail" : content)])
                })
                ForEach(files,id:\.id){file in
                    if let selection{Toggle(selectionLabel+" · "+(file["name"].string.isEmpty ? file.id : file["name"].string),isOn:Binding(get:{selection.wrappedValue.array.contains(.s(file.id))},set:{on in var ids=selection.wrappedValue.array;ids.removeAll{$0 == .s(file.id)};if on{ids.append(.s(file.id))};selection.wrappedValue = .array(ids)}))}
                    if mode == .job{
                        if !file["note"].string.isEmpty{Text(file["note"].string).font(.footnote)}
                        Menu("Možnosti fotografie"){
                            if store.writer && !store.isRolePreview{Button("Upravit poznámku"){photoAction=APIDomainAction(title:"Poznámka k fotografii",path:path+"/"+file.id,method:"PATCH",fields:[.field("note","Poznámka",.notes)],value:.object(["version":file["version"],"note":file["note"]]))}}
                            if store.manager && !store.isRolePreview{Button(file["storage"].string=="app" ? "Odebrat z fotodokumentace" : "Přesunout do koše na Disku",role:.destructive){removePhoto=file;confirmRemoval=true}}
                        }.frame(minHeight:44)
                    }
                }
            }
            if allowed {
                if mode == .job{Picker("Kategorie fotografií",selection:$category){Text("Před prací").tag("before");Text("Průběh").tag("during");Text("Hotová práce").tag("after")};TextField("Poznámka k nové fotografii",text:$note,axis:.vertical)}
                PhotosPicker(selection:$picked,maxSelectionCount:40,matching:.images){Label("Vybrat fotografii",systemImage:"photo")}.frame(minHeight:44)
                if UIImagePickerController.isSourceTypeAvailable(.camera){Button{camera=true}label:{Label("Vyfotit",systemImage:"camera")}.frame(minHeight:44)}
                if mode == .plan {Button("Nahrát PDF nebo obrázek plánu"){importing=true}.frame(minHeight:44)}
            }
            if busy{ProgressView("Nahrávám…")}
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning).font(.callout)}
        }.disabled(busy).onChange(of:picked){_,items in Task{
            let scope=store.scope
            for item in items{
                do{guard let bytes=try await item.loadTransferable(type:Data.self)else{continue};guard scope==store.scope else{break};let mime=item.supportedContentTypes.first(where:{$0.conforms(to:.image)})?.preferredMIMEType ?? "image/jpeg";let photo=try APIImage.prepared(bytes,type:mime);await upload(photo.data,type:photo.type,name:"Fotografie."+photo.extensionName)}catch{problem=error.localizedDescription}
            }
            picked=[]
        }}
            .sheet(isPresented:$camera){APICamera{bytes in Task{await upload(bytes,type:"image/jpeg",name:"Fotografie.jpg")}}}
            .fileImporter(isPresented:$importing,allowedContentTypes:[.pdf,.image]){result in Task{do{let url=try result.get();let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}};let data=try Data(contentsOf:url);if url.pathExtension.lowercased()=="pdf"{await upload(data,type:"application/pdf",name:url.lastPathComponent)}else if let image=UIImage(data:data),let jpeg=APIImage.jpeg(image){await upload(jpeg,type:"image/jpeg",name:url.deletingPathExtension().lastPathComponent+".jpg")}else{throw APIError.local("Plán není podporovaný obrázek ani PDF.")}}catch{problem=error.localizedDescription}}}
            .sheet(item:$photoAction){APIActionEditor(store:store,action:$0)}
            .confirmationDialog(removePhoto["storage"].string=="app" ? "Odebrat fotografii z fotodokumentace? V protokolu a deníku zůstane zachovaná." : "Přesunout tuto fotografii do koše Google Disku?",isPresented:$confirmRemoval,titleVisibility:.visible){Button("Potvrdit odstranění",role:.destructive){Task{do{_ = try await store.write(path+"/"+removePhoto.id,method:"DELETE",body:.object(["version":removePhoto["version"],"confirm":.s(APIPhotoPaths.removalConfirmation(removePhoto))]));await load()}catch{problem=error.localizedDescription}}};Button("Zrušit",role:.cancel){}}
            .task(id:store.scope+store.revision.uuidString){await load()}
    }
    func load() async {
        let scope=store.scope
        do {
            switch mode {
            case .service,.diary,.job:let s=try await store.get(path);guard scope==store.scope else{return};files=s["photos"].array
            case .receipts:let pieces=path.split(separator:"/");guard pieces.count>=5 else{return};let data=try await store.get("/api/vehicles/"+pieces[2]);guard scope==store.scope else{return};files=data["receipts"].array.filter{$0["entryId"].string==String(pieces[4])}
            default:break
            }
            problem=nil
        }catch{if scope==store.scope{problem=error.localizedDescription}}
    }
    func upload(_ data:Data,type:String,name:String) async {
        guard allowed else{return};busy=true;defer{busy=false}
        do {
            guard data.count<=25*1024*1024 else{throw APIError.local("Soubor přesahuje povolenou velikost.")}
            let id=UUID().uuidString
            switch mode {
            case .vehicle:try await store.upload(path,bytes:data,type:type,headers:["if-match":record["version"].string])
            case .receipts:try await store.upload(path+"/"+id,bytes:data,type:type)
            case .service,.diary:try await store.upload((mode == .diary ? path.replacingOccurrences(of:"/service",with:"/diary") : path)+"/photos/"+id,bytes:data,type:type,headers:["x-file-name":name.addingPercentEncoding(withAllowedCharacters:.urlPathAllowed) ?? name],offline:true,id:id);attached?(id)
            case .plan:var form=APIMultipart();form.field("version",record["version"].string);form.file("plan",filename:name,type:type,bytes:data);try await store.upload(path,bytes:form.finished,type:form.type)
            case .job:try await APIJobPhotoUpload.upload(store:store,path:path,data:data,type:type,name:name,id:id,category:category,note:note)
            }
            problem=nil;await load()
        }catch{problem=error.localizedDescription}
    }

}
struct APISignature:View {
    @Binding var encoded:String
    var height:CGFloat=120
    @State private var strokes:[[CGPoint]]=[]
    @State private var drawing=false
    var body:some View{VStack(alignment:.leading,spacing:10){
        Text("Podpis zákazníka").font(.headline)
        GeometryReader{geometry in
            Canvas{context,size in
                if let data=Data(base64Encoded:encoded.components(separatedBy:",").last ?? ""),let image=UIImage(data:data){context.draw(Image(uiImage:image),in:CGRect(origin:.zero,size:size))}
                for points in strokes{var path=Path();if let first=points.first{path.move(to:CGPoint(x:first.x*size.width,y:first.y*size.height));for p in points.dropFirst(){path.addLine(to:CGPoint(x:p.x*size.width,y:p.y*size.height))};context.stroke(path,with:.color(.black),lineWidth:2)}}
            }.background(Color.white,in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(.gray.opacity(0.3)))
            .gesture(DragGesture(minimumDistance:0).onChanged{gesture in if !drawing{drawing=true;strokes.append([])};let point=CGPoint(x:max(0,min(1,gesture.location.x/max(1,geometry.size.width))),y:max(0,min(1,gesture.location.y/max(1,geometry.size.height))));strokes[strokes.count-1].append(point)}.onEnded{_ in drawing=false;render()})
        }.frame(height:height).accessibilityIdentifier("protocol-signature-canvas").accessibilityLabel("Podpisová plocha. Podepište se prstem.").accessibilityAddTraits(.allowsDirectInteraction)
        Button("Vymazat podpis",role:.destructive){encoded="";strokes=[];drawing=false}.frame(minHeight:44)
    }}
    func render(){guard strokes.contains(where:{$0.count>1 && (($0.map(\.x).max() ?? 0)-($0.map(\.x).min() ?? 0))+(($0.map(\.y).max() ?? 0)-($0.map(\.y).min() ?? 0))>0.003})else{strokes=[];return};let image=UIGraphicsImageRenderer(size:CGSize(width:320,height:120)).image{context in UIColor.white.setFill();context.fill(CGRect(x:0,y:0,width:320,height:120));if let bytes=Data(base64Encoded:encoded.components(separatedBy:",").last ?? ""),let old=UIImage(data:bytes){old.draw(in:CGRect(x:0,y:0,width:320,height:120))};context.cgContext.setStrokeColor(UIColor.black.cgColor);context.cgContext.setLineWidth(2);for points in strokes{guard let first=points.first else{continue};context.cgContext.beginPath();context.cgContext.move(to:CGPoint(x:first.x*320,y:first.y*120));for p in points.dropFirst(){context.cgContext.addLine(to:CGPoint(x:p.x*320,y:p.y*120))};context.cgContext.strokePath()}};if let bytes=image.pngData(),bytes.count<35000{encoded="data:image/png;base64,"+bytes.base64EncodedString();strokes=[]}}
}
