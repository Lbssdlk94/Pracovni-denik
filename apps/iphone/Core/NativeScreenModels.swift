import Foundation

struct NativeOption: Decodable, Identifiable { let id: String; let text: String; let disabled: Bool?; let selected: Bool? }
struct NativePin: Decodable, Identifiable {
    let id: String; let handle: String; let text: String
    let color: String?
    let x: Double?; let y: Double?; let latitude: Double?; let longitude: Double?
}
struct NativeSurfaceLine: Decodable, Identifiable {
    let id: String; let x1: Double; let y1: Double; let x2: Double; let y2: Double; let color: String?
}
struct NativeMapCoordinate: Decodable { let latitude: Double; let longitude: Double }
struct NativeMapPath: Decodable, Identifiable { let id: String; let points: [NativeMapCoordinate] }
struct NativeControl: Decodable, Identifiable {
    let id: String; let handle: String; let kind: String
    let text: String?; let value: String?; let fieldType: String?
    let checked: Bool?; let disabled: Bool?; let required: Bool?; let secure: Bool?
    let multiple: Bool?; let primary: Bool?; let danger: Bool?; let expanded: Bool?
    let level: Int?; let width: Double?; let height: Double?
    let latitude: Double?; let longitude: Double?; let zoom: Double?
    let lines: [NativeSurfaceLine]?; let paths: [NativeMapPath]?
    let imageHandle: String?; let options: [NativeOption]?; let children: [NativeControl]?; let pins: [NativePin]?
    var label: String { text ?? "" }
    func find(_ key: String) -> NativeControl? {
        if id == key { return self }
        return children?.compactMap { $0.find(key) }.first
    }
}
struct NativeFileRequest: Decodable, Identifiable {
    let id: String; let label: String; let accept: String; let multiple: Bool; let camera: Bool
}
struct NativeTransfer: Decodable, Identifiable { let id: String; let text: String }
struct NativeScreenSnapshot: Decodable {
    let revision: Int; let title: String; let nodes: [NativeControl]
    let modal: Bool?; let online: Bool?; let busy: Bool?; let toast: String?
    let file: NativeFileRequest?; let transfer: NativeTransfer?
    func find(_ key: String) -> NativeControl? { nodes.compactMap { $0.find(key) }.first }
}
struct NativeAsset: Decodable {
    let data: String; let type: String; let name: String
    var bytes: Data? { Data(base64Encoded: data) }
}
struct NativePickedFile {
    let data: Data; let name: String; let type: String
    var payload: [String: Any] { ["data":data.base64EncodedString(),"name":name,"type":type] }
}
struct NativePreviewFile: Identifiable { let id = UUID(); let url: URL }
