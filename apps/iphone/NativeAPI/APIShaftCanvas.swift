import SwiftUI
import UIKit

struct APIShaftCanvas:View {
    let image:UIImage
    @Binding var markers:APIValue
    var editable=false
    var body:some View{GeometryReader{geometry in
        let scale=min(geometry.size.width/image.size.width,geometry.size.height/image.size.height)
        let width=image.size.width*scale,height=image.size.height*scale
        let origin=CGPoint(x:(geometry.size.width-width)/2,y:(geometry.size.height-height)/2)
        ZStack(alignment:.topLeading){Image(uiImage:image).resizable().frame(width:width,height:height).position(x:geometry.size.width/2,y:geometry.size.height/2)
            ForEach(Array(markers.array.enumerated()),id:\.offset){index,marker in
                let point=CGPoint(x:origin.x+marker["x"].double*width,y:origin.y+marker["y"].double*height)
                let label=CGPoint(x:origin.x+marker["labelX"].double*width,y:origin.y+marker["labelY"].double*height)
                Path{path in path.move(to:point);path.addLine(to:label)}.stroke(color(marker["color"].string),lineWidth:2)
                Circle().fill(color(marker["color"].string)).frame(width:18,height:18).position(point).gesture(DragGesture(coordinateSpace:.named("shaft-canvas")).onChanged{g in move(index,g.location,origin:origin,width:width,height:height,label:false)})
                Text(marker["zoneName"].string).font(.caption.bold()).foregroundStyle(.black).padding(5).background(.white.opacity(0.9),in:Capsule()).position(label).gesture(DragGesture(coordinateSpace:.named("shaft-canvas")).onChanged{g in move(index,g.location,origin:origin,width:width,height:height,label:true)})
            }
        }.coordinateSpace(name:"shaft-canvas")
    }.frame(height:300)}
    func color(_ hex:String)->Color{let value=UInt64(hex.trimmingCharacters(in:CharacterSet(charactersIn:"#")),radix:16) ?? 0x184D40;return Color(red:Double((value>>16)&255)/255,green:Double((value>>8)&255)/255,blue:Double(value&255)/255)}
    func move(_ index:Int,_ point:CGPoint,origin:CGPoint,width:CGFloat,height:CGFloat,label:Bool){guard editable,width>0,height>0,markers.array.indices.contains(index)else{return};var rows=markers.array;rows[index][label ? "labelX":"x"] = .number(min(1,max(0,(point.x-origin.x)/width)));rows[index][label ? "labelY":"y"] = .number(min(1,max(0,(point.y-origin.y)/height)));markers = .array(rows)}
    @MainActor static func exported(image:UIImage,markers:APIValue)->Data?{let renderer=UIGraphicsImageRenderer(size:image.size);return renderer.image{ctx in image.draw(at:.zero);for marker in markers.array{let p=CGPoint(x:marker["x"].double*image.size.width,y:marker["y"].double*image.size.height),label=CGPoint(x:marker["labelX"].double*image.size.width,y:marker["labelY"].double*image.size.height);ctx.cgContext.setStrokeColor(UIColor.systemGreen.cgColor);ctx.cgContext.setFillColor(UIColor.systemGreen.cgColor);ctx.cgContext.setLineWidth(max(2,image.size.width/600));ctx.cgContext.move(to:p);ctx.cgContext.addLine(to:label);ctx.cgContext.strokePath();ctx.cgContext.fillEllipse(in:CGRect(x:p.x-7,y:p.y-7,width:14,height:14));(marker["zoneName"].string as NSString).draw(at:label,withAttributes:[.font:UIFont.boldSystemFont(ofSize:max(16,image.size.width/50)),.foregroundColor:UIColor.black,.backgroundColor:UIColor.white])}}.jpegData(compressionQuality:0.9)}
}
struct APIShaftContent:View {
    @ObservedObject var store:APIStore
    let record:APIValue
    @State private var bytes:Data?
    @State private var file:APIFile?
    var body:some View{VStack(alignment:.leading,spacing:16){if let bytes,let image=APIImage.thumbnail(bytes){APIShaftCanvas(image:image,markers:.constant(record["markers"]));if store.enabled("pictureExport"){Button("Sdílet fotografii se značkami"){if let data=APIShaftCanvas.exported(image:image,markers:record["markers"]){file=APIFile(url:APIImage.temporary(data,name:"Sachta-se-znackami.jpg"))}}}};APIReadFields(value:record,fields:APIResource(entity:.shafts).fields.filter{$0.id != "markers"});if !record["position"].isNull{let p=record["position"];Link("Navigovat k šachtě",destination:URL(string:"https://maps.apple.com/?daddr=\(p["latitude"].double),\(p["longitude"].double)")!)};if let message=store.error{Text(message).font(.footnote)}}.diaryCard().task{do{bytes=try await store.file("/api/shafts/"+record.id+"/photo",version:record["imageVersion"]).data}catch{store.error=error.localizedDescription}}.sheet(item:$file){FileShare(url:$0.url)}}
}

struct APIPlanCanvas:View {
    let image:UIImage
    let shafts:[APIValue]
    @Binding var markers:APIValue
    var editable:Bool
    var body:some View{GeometryReader{geometry in
        let scale=min(geometry.size.width/image.size.width,geometry.size.height/image.size.height)
        let width=image.size.width*scale,height=image.size.height*scale
        let origin=CGPoint(x:(geometry.size.width-width)/2,y:(geometry.size.height-height)/2)
        ZStack(alignment:.topLeading){
            Image(uiImage:image).resizable().frame(width:width,height:height).position(x:geometry.size.width/2,y:geometry.size.height/2)
            ForEach(Array(markers.array.enumerated()),id:\.offset){index,marker in
                Label(shafts.first{$0.id==marker["shaftId"].string}?.title ?? "Šachta",systemImage:"mappin.circle.fill")
                    .font(.caption.bold()).foregroundStyle(DiaryStyle.accent).padding(8).background(.regularMaterial,in:Capsule()).frame(minWidth:44,minHeight:44)
                    .position(x:origin.x+marker["x"].double*width,y:origin.y+marker["y"].double*height)
                    .gesture(DragGesture(coordinateSpace:.named("plan-canvas")).onChanged{gesture in guard editable,width>0,height>0,markers.array.indices.contains(index)else{return};var rows=markers.array;rows[index]["x"] = .number(min(1,max(0,(gesture.location.x-origin.x)/width)));rows[index]["y"] = .number(min(1,max(0,(gesture.location.y-origin.y)/height)));markers = .array(rows)})
            }
        }.coordinateSpace(name:"plan-canvas")
    }.frame(height:340).accessibilityLabel("Obrázkový plán s polohami šachet")}
}
