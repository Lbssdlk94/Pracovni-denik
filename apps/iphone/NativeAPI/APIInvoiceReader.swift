import Foundation
import PDFKit
import Vision

enum APIInvoiceReader {
    static func read(_ bytes: Data) throws -> String {
        guard let pdf = PDFDocument(data: bytes), !pdf.isLocked else { throw APIError.local("PDF je zamčené nebo nečitelné.") }
        var parts: [String] = []
        for index in 0..<min(pdf.pageCount, 8) {
            try autoreleasepool {
                guard let page = pdf.page(at: index) else { return }
                let embedded = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if embedded.count >= 40 { parts.append(embedded); return }
                guard let image = page.thumbnail(of: CGSize(width: 1500, height: 2050), for: .cropBox).cgImage else { return }
                let recognition = VNRecognizeTextRequest()
                recognition.recognitionLevel = .accurate
                recognition.automaticallyDetectsLanguage = true
                try VNImageRequestHandler(cgImage: image).perform([recognition])
                parts.append((recognition.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
            }
        }
        let text = String(parts.joined(separator: "\n").prefix(100_000))
        guard !text.isEmpty else { throw APIError.local("V PDF se nepodařilo přečíst text. Údaje můžete zadat ručně.") }
        return text
    }

    static func suggestions(_ text: String) -> [String: String] {
        let source = text.folding(options: [.caseInsensitive,.diacriticInsensitive], locale: Locale(identifier: "cs_CZ"))
        let patterns = [
            "reference": #"(?:faktura\s*(?:cislo|c\.)|cislo faktury|invoice (?:number|no\.?))\s*[:#]?\s*([a-z0-9][a-z0-9/_\-.]*)"#,
            "variableSymbol": #"(?:variabilni symbol|\bvs)\s*:?\s*([0-9]{1,10})\b"#,
            "bankAccount": #"(?:cislo uctu|bankovni ucet)\s*:?\s*([0-9-]+/[0-9]{4})"#,
            "amountMinor": #"(?:celkem k uhrade|castka k uhrade|celkem vcetne dph)\s*:?\s*([0-9][0-9 \u00a0]*(?:[,.][0-9]{2})?)\s*(?:kc|czk)"#,
            "issuedOn": #"(?:datum vystaveni|vystaveno)\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{2}-\d{2})"#,
            "dueDate": #"(?:datum splatnosti|splatnost)\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}|\d{4}-\d{2}-\d{2})"#
        ]
        var fields: [String: String] = [:]
        for (key, pattern) in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            // Match against original text for identifiers whose letter case matters.
            let lines = text.components(separatedBy: .newlines)
            let values = lines.compactMap { line -> String? in
                let folded = line.folding(options: [.caseInsensitive,.diacriticInsensitive], locale: Locale(identifier: "cs_CZ"))
                let s = folded as NSString
                guard let hit = regex.firstMatch(in: folded, range: NSRange(location: 0, length: s.length)) else { return nil }
                if key == "reference" {
                    guard let original = line.range(of: s.substring(with: hit.range(at: 1)), options: [.caseInsensitive,.backwards]) else { return nil }
                    return String(line[original])
                }
                return s.substring(with: hit.range(at: 1)).filter { !$0.isWhitespace }
            }
            guard Set(values).count == 1, var value = values.first else { continue }
            if key == "amountMinor" && source.range(of: #"\b(eur|usd|gbp)\b|[€$£]"#, options: .regularExpression) != nil { continue }
            if key == "issuedOn" || key == "dueDate" {
                let parts = value.split(separator: ".").compactMap { Int($0) }
                if parts.count == 3 { value = String(format: "%04d-%02d-%02d", parts[2], parts[1], parts[0]) }
                guard let date = DiaryDate.parse(value), DiaryDate.iso(date) == value else { continue }
            }
            fields[key] = value
        }
        return fields
    }
}
