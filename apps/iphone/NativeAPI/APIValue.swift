import Foundation

// Data only. No HTML, selectors, executable scripts or server-defined UI.
indirect enum APIValue: Codable, Equatable, Sendable {
    case object([String: APIValue]), array([APIValue]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([APIValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: APIValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    subscript(key: String) -> APIValue {
        get { if case .object(let v) = self { return v[key] ?? .null }; return .null }
        set { var v = object; v[key] = newValue; self = .object(v) }
    }
    var object: [String: APIValue] { if case .object(let v) = self { return v }; return [:] }
    var array: [APIValue] { if case .array(let v) = self { return v }; return [] }
    var string: String {
        switch self { case .string(let v): return v; case .number(let v): return v.rounded() == v ? String(format: "%.0f", v) : String(v); case .bool(let v): return v ? "true" : "false"; default: return "" }
    }
    var double: Double { if case .number(let v) = self { return v }; return Double(string.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    var int: Int { Int(double) }
    var bool: Bool { if case .bool(let v) = self { return v }; return false }
    var isNull: Bool { self == .null }
    var id: String { self["id"].string.isEmpty ? self["userId"].string : self["id"].string }
    var title: String { ["name", "title", "customerName", "userName", "date", "label"].map { self[$0].string }.first(where: { !$0.isEmpty }) ?? (self["definition"]["name"].string.isEmpty ? "Záznam" : self["definition"]["name"].string) }
    func selecting(_ keys: [String]) -> APIValue { .object(object.filter { keys.contains($0.key) }) }
    func merged(_ other: [String: APIValue]) -> APIValue { .object(object.merging(other) { _, new in new }) }
    func data() throws -> Data { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return try e.encode(self) }
    func decode<T: Decodable>(_ type: T.Type) throws -> T { try JSONDecoder().decode(type, from: data()) }
    static func s(_ value: String) -> APIValue { .string(value) }
    static func n(_ value: Int) -> APIValue { .number(Double(value)) }
}
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String
    var details: APIValue = .null
    var errorDescription: String? { message }
    var isTransient: Bool { (status == 0 && code == "connection") || [408, 429, 500, 502, 503, 504].contains(status) }
    static func local(_ message: String) -> APIError { APIError(status: 0, code: "local", message: message) }
}
