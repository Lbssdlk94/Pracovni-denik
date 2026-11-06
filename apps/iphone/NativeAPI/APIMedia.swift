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
    @State private var thumbnail:UIImage?
    @State private var problem:String?
    var body:some View {
        Group {
            if let thumbnail{Image(uiImage:thumbnail).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius:18))}
            else if let problem{Text(problem).font(.footnote).foregroundStyle(.secondary)}
            else{ProgressView("Načítám fotografii…")}
        }.task(id:store.scope+path+version.string){let scope=store.scope;thumbnail=nil;do{let r=try await store.file(path,version:version);guard scope==store.scope else{return};thumbnail=APIImage.thumbnail(r.data);problem=nil}catch{thumbnail=nil;problem=error.localizedDescription}}
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
    static func jpeg(_ image:UIImage)->Data? { let scale=min(1,2048/max(image.size.width,image.size.height));let size=CGSize(width:max(1,image.size.width*scale),height:max(1,image.size.height*scale));return UIGraphicsImageRenderer(size:size).image{_ in image.draw(in:CGRect(origin:.zero,size:size))}.jpegData(compressionQuality:0.85) }
    static func temporary(_ data:Data,name:String)->URL {let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true);try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true);let url=directory.appendingPathComponent(name.replacingOccurrences(of:"/",with:"_"));try? data.write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]);return url}
}
struct APIFilesView:View {
    enum Mode {case vehicle,receipts,service,job,plan}
    @ObservedObject var store:APIStore
    let path:String
    let mode:Mode
    let record:APIValue
    var attached:((String)->Void)? = nil
    var selection:Binding<APIValue>? = nil
    @State private var picked:PhotosPickerItem?
    @State private var camera=false
    @State private var importing=false
    @State private var files:[APIValue]=[]
    @State private var problem:String?
    @State private var preview:APIFile?
    @State private var busy=false
    @State private var category="during"
    @State private var note=""
    @State private var photoAction:APIDomainAction?
    @State private var removePhoto:APIValue = .null
    @State private var confirmRemoval=false
    var allowed:Bool { store.writer && store.enabled("photoUploads") && (mode != .service || store.enabled("protocolPhotos")) && (mode != .receipts || store.enabled("fleetReceipts")) && (mode != .job || store.enabled("drivePhotos") && store.enabled("googleDrive")) }
    var body:some View {
        VStack(alignment:.leading,spacing:12) {
            if mode != .vehicle && mode != .plan {
                ForEach(Array(files.enumerated()),id:\.offset){_,file in VStack(alignment:.leading){Button(file["name"].string.isEmpty ? file["fileName"].string : file["name"].string){Task{await open(file)}}.frame(minHeight:44);if let selection{Toggle("Zahrnout do protokolu",isOn:Binding(get:{selection.wrappedValue.array.contains(.s(file.id))},set:{on in var ids=selection.wrappedValue.array;ids.removeAll{$0 == .s(file.id)};if on{ids.append(.s(file.id))};selection.wrappedValue = .array(ids)}))};if mode == .job{if !file["note"].string.isEmpty{Text(file["note"].string).font(.footnote)};if store.writer{Button("Upravit poznámku"){photoAction=APIDomainAction(title:"Poznámka k fotografii",path:path+"/"+file.id,method:"PATCH",fields:[.field("note","Poznámka",.notes)],value:.object(["version":file["version"],"note":file["note"]]))}};if store.manager{Button("Přesunout do koše na Disku",role:.destructive){removePhoto=file;confirmRemoval=true}}}}}
            }
            if allowed {
                if mode == .job{Picker("Kategorie fotografií",selection:$category){Text("Před prací").tag("before");Text("Průběh").tag("during");Text("Hotová práce").tag("after")};TextField("Poznámka k nové fotografii",text:$note,axis:.vertical)}
                PhotosPicker(selection:$picked,matching:.images){Label("Vybrat fotografii",systemImage:"photo")}.frame(minHeight:44)
                if UIImagePickerController.isSourceTypeAvailable(.camera){Button{camera=true}label:{Label("Vyfotit",systemImage:"camera")}.frame(minHeight:44)}
                if mode == .plan {Button("Nahrát PDF nebo obrázek plánu"){importing=true}.frame(minHeight:44)}
            }
            if busy{ProgressView("Nahrávám…")}
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning).font(.callout)}
        }.disabled(busy).onChange(of:picked){_,item in Task{do{if let bytes=try await item?.loadTransferable(type:Data.self){let mime=item?.supportedContentTypes.first(where:{$0.conforms(to:.image)})?.preferredMIMEType ?? "image/jpeg";if (mode == .service || mode == .job) && ["image/jpeg","image/png","image/heic","image/heif"].contains(mime){await upload(bytes,type:mime,name:"Fotografie."+(UTType(mimeType:mime)?.preferredFilenameExtension ?? "jpg"))}else if let image=UIImage(data:bytes),let jpg=APIImage.jpeg(image){await upload(jpg,type:"image/jpeg",name:"Fotografie.jpg")}else{throw APIError.local("Fotografii nelze otevřít.")}}}catch{problem=error.localizedDescription};picked=nil}}
            .sheet(isPresented:$camera){APICamera{bytes in Task{await upload(bytes,type:"image/jpeg",name:"Fotografie.jpg")}}}
            .sheet(item:$preview,onDismiss:{}){file in APIQuickLook(url:file.url).onDisappear{try? FileManager.default.removeItem(at:file.url.deletingLastPathComponent())}}
            .fileImporter(isPresented:$importing,allowedContentTypes:[.pdf,.image]){result in Task{do{let url=try result.get();let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}};let data=try Data(contentsOf:url);if url.pathExtension.lowercased()=="pdf"{await upload(data,type:"application/pdf",name:url.lastPathComponent)}else if let image=UIImage(data:data),let jpeg=APIImage.jpeg(image){await upload(jpeg,type:"image/jpeg",name:url.deletingPathExtension().lastPathComponent+".jpg")}else{throw APIError.local("Plán není podporovaný obrázek ani PDF.")}}catch{problem=error.localizedDescription}}}
            .sheet(item:$photoAction){APIActionEditor(store:store,action:$0)}
            .confirmationDialog("Přesunout tuto fotografii do koše Google Disku?",isPresented:$confirmRemoval,titleVisibility:.visible){Button("Přesunout do koše",role:.destructive){Task{do{_ = try await store.write(path+"/"+removePhoto.id,method:"DELETE",body:.object(["version":removePhoto["version"],"confirm":.s("TRASH_GOOGLE_DRIVE_PHOTO")]));await load()}catch{problem=error.localizedDescription}}};Button("Zrušit",role:.cancel){}}
            .task(id:store.revision){await load()}
    }
    func load() async {
        do {
            switch mode {
            case .service:let s=try await store.get(path);files=s["photos"].array
            case .receipts:let pieces=path.split(separator:"/");guard pieces.count>=5 else{return};let data=try await store.get("/api/vehicles/"+pieces[2]);files=data["receipts"].array.filter{$0["entryId"].string==String(pieces[4])}
            case .job:let s=try await store.get(path);files=s["photos"].array
            default:break
            }
        }catch{problem=error.localizedDescription}
    }
    func upload(_ data:Data,type:String,name:String) async {
        guard allowed else{return};busy=true;defer{busy=false}
        do {
            guard data.count<=25*1024*1024 else{throw APIError.local("Soubor přesahuje povolenou velikost.")}
            let id=UUID().uuidString
            switch mode {
            case .vehicle:try await store.upload(path,bytes:data,type:type,headers:["if-match":record["version"].string])
            case .receipts:try await store.upload(path+"/"+id,bytes:data,type:type)
            case .service:try await store.upload(path+"/photos/"+id,bytes:data,type:type,headers:["x-file-name":name.addingPercentEncoding(withAllowedCharacters:.urlPathAllowed) ?? name],offline:true,id:id);attached?(id)
            case .plan:var form=APIMultipart();form.field("version",record["version"].string);form.file("plan",filename:name,type:type,bytes:data);try await store.upload(path,bytes:form.finished,type:form.type)
            case .job:try await APIJobPhotoUpload.upload(store:store,path:path,data:data,type:type,name:name,id:id,category:category,note:note)
            }
            problem=nil;await load()
        }catch{problem=error.localizedDescription}
    }
    func open(_ file:APIValue) async {
        do { let url=mode == .service ? path+"/photos/"+file.id : mode == .job ? path+"/"+file.id+"/content" : path+"/"+file.id
            let bytes=try await store.file(url);preview=APIFile(url:APIImage.temporary(bytes.data,name:file["name"].string.isEmpty ? "Fotografie.jpg" : file["name"].string))
        }catch{problem=error.localizedDescription}
    }
}
struct APISignature:View {
    @Binding var encoded:String
    @State private var strokes:[[CGPoint]]=[]
    var body:some View {
        VStack(alignment:.leading,spacing:10){Text("Podpis zákazníka").font(.headline)
            Canvas{context,size in
                if let data=Data(base64Encoded:encoded.components(separatedBy:",").last ?? ""),let image=UIImage(data:data){context.draw(Image(uiImage:image),in:CGRect(origin:.zero,size:size))}
                for points in strokes{var path=Path();if let p=points.first{path.move(to:CGPoint(x:p.x*size.width,y:p.y*size.height));for point in points.dropFirst(){path.addLine(to:CGPoint(x:point.x*size.width,y:point.y*size.height))};context.stroke(path,with:.color(.black),lineWidth:2)}}
            }.frame(height:120).background(Color.white,in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(.gray.opacity(0.3)))
                .gesture(DragGesture(minimumDistance:0).onChanged{g in let point=CGPoint(x:max(0,min(1,g.location.x/320)),y:max(0,min(1,g.location.y/120)));if g.translation == .zero{strokes.append([point])}else{if strokes.isEmpty{strokes.append([])};strokes[strokes.count-1].append(point)}}.onEnded{_ in render()})
            Button("Vymazat podpis",role:.destructive){encoded="";strokes=[]}.frame(minHeight:44)
        }
    }
    func render(){let renderer=UIGraphicsImageRenderer(size:CGSize(width:320,height:120));let image=renderer.image{ctx in UIColor.white.setFill();ctx.fill(CGRect(x:0,y:0,width:320,height:120));if let d=Data(base64Encoded:encoded.components(separatedBy:",").last ?? ""),let old=UIImage(data:d){old.draw(in:CGRect(x:0,y:0,width:320,height:120))};ctx.cgContext.setStrokeColor(UIColor.black.cgColor);ctx.cgContext.setLineWidth(2);for points in strokes{guard let p=points.first else{continue};ctx.cgContext.beginPath();ctx.cgContext.move(to:CGPoint(x:p.x*320,y:p.y*120));for q in points.dropFirst(){ctx.cgContext.addLine(to:CGPoint(x:q.x*320,y:q.y*120))};ctx.cgContext.strokePath()}};if let data=image.pngData(),data.count<35000{encoded="data:image/png;base64,"+data.base64EncodedString();strokes=[]}}
}
