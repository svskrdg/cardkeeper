import Foundation

struct ContactDraft {
    var firstName = ""
    var lastName = ""
    var company = ""
    var title = ""
    var phone = ""
    var email = ""
    var website = ""
    var address = ""
    var rawText = ""
}

/// Heuristic extraction: user always reviews the data before saving.
enum CardParser {
    static func parse(_ text: String) -> ContactDraft {
        var draft = ContactDraft()
        draft.rawText = text
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return draft }

        let emailPattern = #"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}"#
        let urlPattern = #"(?:(?:https?://)?(?:www\.)[A-Z0-9.\-]+\.[A-Z]{2,}|https?://[A-Z0-9.\-]+\.[A-Z]{2,})[^\s]*"#
        if let email = matches(emailPattern, in: text).first { draft.email = email.lowercased() }
        if let url = matches(urlPattern, in: text).first { draft.website = url }
        if draft.website.isEmpty, let domain = draft.email.split(separator: "@").last,
           !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com", "proton.me"].contains(String(domain)) {
            draft.website = String(domain)
        }

        let addressWords = ["street", "strada", "str.", "bulevard", "bd.", "blvd", "avenue", "road", "sokak", "sok.", "cadde", "caddesi", "mahallesi", "sector", "postal", "postcode"]
        let companyWords = ["srl", "s.r.l", "ltd", "limited", "inc", "llc", "gmbh", "travel", "tourism", "turizm", "hotel", "group", "company", "agency", "ajans", "a.ş."]
        let titleWords = ["manager", "director", "president", "founder", "owner", "ceo", "sales", "marketing", "engineer", "consultant", "coordinator", "specialist", "reprezentant", "administrator", "müdür", "müdürü", "yönetici", "başkan"]
        var candidateNames: [String] = []

        for line in lines {
            let lower = line.lowercased()
            if lower.contains("fax") { continue }
            if draft.phone.isEmpty && !line.contains("@") && !lower.contains("www") {
                let phonePattern = #"(?<![A-Za-z0-9])\+?[0-9][0-9 ()\/\.\-]{6,}[0-9]"#
                for hit in matches(phonePattern, in: line) {
                    let digitCount = hit.filter(\.isNumber).count
                    if (7...15).contains(digitCount) {
                        draft.phone = hit.trimmingCharacters(in: .whitespacesAndNewlines)
                        break
                    }
                }
            }
            if draft.address.isEmpty && addressWords.contains(where: { lower.contains($0) }) {
                draft.address = line
                continue
            }
            if draft.title.isEmpty && titleWords.contains(where: { lower.contains($0) }) {
                draft.title = line
                continue
            }
            if draft.company.isEmpty && companyWords.contains(where: { lower.contains($0) }) {
                draft.company = line
                continue
            }
            if line.contains("@") || lower.contains("www.") || lower.contains("http") ||
                lower.contains("tel") || lower.contains("phone") || lower.contains("mobil") ||
                lower.contains("gsm") || lower.contains("fax") || lower.contains("telefon") ||
                line.filter(\.isNumber).count > 3 { continue }
            let words = line.split(whereSeparator: \.isWhitespace)
            if (2...4).contains(words.count) && words.allSatisfy({ $0.first?.isLetter ?? false }) {
                candidateNames.append(line)
            }
        }
        if let name = candidateNames.first {
            let words = name.split(whereSeparator: \.isWhitespace).map(String.init)
            draft.firstName = words.first ?? ""
            draft.lastName = words.dropFirst().joined(separator: " ")
        }
        return draft
    }

    private static func matches(_ pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            guard let r = Range(match.range, in: text) else { return nil }
            return String(text[r])
        }
    }
}
