import Foundation

// Keep the user's edit order; an asynchronous failure must not replace a newer
// edit with the failed request's older value or allow a stale submitter through.
struct NativeEditQueue {
    private var values: [String: [String: Any]] = [:]
    private var order: [String] = []
    var isEmpty: Bool { order.isEmpty }
    mutating func set(_ key: String, _ value: [String: Any]) {
        values[key] = value; order.removeAll { $0 == key }; order.append(key)
    }
    mutating func takeFirst() -> (key: String, value: [String: Any])? {
        guard !order.isEmpty else { return nil }
        let key = order.removeFirst()
        guard let value = values.removeValue(forKey: key) else { return nil }
        return (key, value)
    }
    mutating func restoreFirst(_ key: String, _ value: [String: Any]) {
        guard values[key] == nil else { return }
        values[key] = value; order.insert(key, at: 0)
    }
    mutating func clear() { values = [:]; order = [] }
}
