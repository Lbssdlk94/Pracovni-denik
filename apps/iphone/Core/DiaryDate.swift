import Foundation

enum DiaryDate {
    static func parse(_ value: String) -> Date? {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "Europe/Prague"); f.dateFormat = "yyyy-MM-dd"; return f.date(from: value)
    }
    static func iso(_ value: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "Europe/Prague"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: value)
    }
    static func shifted(_ value: String, days: Int) -> String {
        guard let date = parse(value) else { return value }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Europe/Prague")!
        return calendar.date(byAdding: .day, value: days, to: date).map(iso) ?? value
    }
    static func localized(_ value: String) -> String {
        guard let date = parse(value) else { return value }
        let f = DateFormatter(); f.locale = Locale(identifier: "cs_CZ"); f.timeZone = TimeZone(identifier: "Europe/Prague"); f.dateStyle = .medium; return f.string(from: date)
    }
}
