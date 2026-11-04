import SwiftUI
import MapKit

struct NativeDrawingSurface: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    @State private var points: [CGPoint] = []
    var imageHandle: String { control.imageHandle ?? control.handle }
    var body: some View {
        VStack(alignment: .leading) {
            Text(control.label).font(.headline)
            GeometryReader { geometry in
                let size=geometry.size
                ZStack(alignment: .topLeading) {
                    Color.white
                    if let data=store.images[imageHandle], let image=UIImage(data:data) { Image(uiImage:image).resizable().scaledToFit().frame(width:size.width,height:size.height) }
                    if control.kind == "canvas" {
                        Canvas { context,_ in
                            guard let first=points.first else { return };var path=Path();path.move(to:first);for point in points.dropFirst() { path.addLine(to:point) };context.stroke(path,with:.color(DiaryStyle.accent),lineWidth:2.4)
                        }.gesture(DragGesture(minimumDistance:0).onChanged { value in if control.disabled != true { points.append(value.location) } }.onEnded { _ in
                            guard control.disabled != true,points.count>1 else { points=[];return }
                            let line=points.map { ["x":max(0,min(1,$0.x/size.width)),"y":max(0,min(1,$0.y/size.height))] };points=[]
                            Task { await store.perform(control,action:"draw",extra:["points":line]);await store.image(imageHandle,force:true) }
                        })
                    } else {
                        Color.clear.contentShape(Rectangle()).onTapGesture { point in
                            if control.disabled != true { Task { await store.perform(control,action:"point",extra:["x":point.x/size.width,"y":point.y/size.height]) } }
                        }
                        ForEach(control.pins ?? []) { pin in
                            Text(pin.text).font(.caption.bold()).padding(8).background(DiaryStyle.soft,in:Capsule())
                                .position(x:(pin.x ?? 0.5)*size.width,y:(pin.y ?? 0.5)*size.height)
                                .onTapGesture { Task { await store.perform(pinControl(pin)) } }
                                .gesture(DragGesture(minimumDistance:4,coordinateSpace:.named(control.handle)).onEnded { value in
                                    guard control.disabled != true else { return };let start=["x":pin.x ?? 0.5,"y":pin.y ?? 0.5],end=["x":max(0,min(1,value.location.x/size.width)),"y":max(0,min(1,value.location.y/size.height))]
                                    Task { await store.perform(pinControl(pin),action:"draw",extra:["points":[start,end,end]]) }
                                })
                        }
                    }
                }.coordinateSpace(name:control.handle).clipShape(RoundedRectangle(cornerRadius:14)).overlay(RoundedRectangle(cornerRadius:14).stroke(.secondary.opacity(0.3)))
            }.aspectRatio(max(1,control.width ?? 1000)/max(1,control.height ?? 700), contentMode: .fit)
        }.task(id:imageHandle) { await store.image(imageHandle) }
    }
    func pinControl(_ pin: NativePin) -> NativeControl {
        // Decode the same typed contract, without exposing arbitrary selectors.
        let data=try! JSONSerialization.data(withJSONObject:["id":pin.id,"handle":pin.handle,"kind":"button","text":pin.text])
        return try! JSONDecoder().decode(NativeControl.self,from:data)
    }
}
struct NativeMapSurface: View {
    let control: NativeControl
    @ObservedObject var store: NativeScreenStore
    @State private var position: MapCameraPosition = .automatic
    var center: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude:control.latitude ?? 49.8,longitude:control.longitude ?? 15.4) }
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            Text(control.label).font(.headline)
            MapReader { proxy in
                Map(position:$position) {
                    ForEach(control.pins ?? []) { pin in
                        Annotation(pin.text,coordinate:CLLocationCoordinate2D(latitude:pin.latitude ?? center.latitude,longitude:pin.longitude ?? center.longitude)) {
                            Button { Task { await store.perform(control,action:"map",extra:["latitude":pin.latitude ?? center.latitude,"longitude":pin.longitude ?? center.longitude,"pin":pin.handle]) } } label: { Image(systemName:"mappin.circle.fill").font(.title).foregroundStyle(DiaryStyle.accent).background(.white,in:Circle()) }.accessibilityLabel(pin.text)
                        }
                    }
                }.mapControls { MapCompass();MapScaleView() }
                    .onTapGesture { point in if let coordinate=proxy.convert(point,from:.local) { Task { await store.perform(control,action:"map",extra:["latitude":coordinate.latitude,"longitude":coordinate.longitude,"select":true]) } } }
                    .onMapCameraChange(frequency:.onEnd) { value in
                        guard abs(value.region.center.latitude-center.latitude)>0.00001||abs(value.region.center.longitude-center.longitude)>0.00001 else { return }
                        Task { await store.perform(control,action:"map",extra:["latitude":value.region.center.latitude,"longitude":value.region.center.longitude,"zoom":log2(360/max(0.0001,value.region.span.longitudeDelta))]) }
                    }
            }.frame(height:320).clipShape(RoundedRectangle(cornerRadius:18))
            NativeControlList(controls:control.children ?? [],store:store)
        }.onAppear { let delta=360/pow(2,control.zoom ?? 8);position = .region(MKCoordinateRegion(center:center,span:MKCoordinateSpan(latitudeDelta:delta,longitudeDelta:delta))) }
    }
}
