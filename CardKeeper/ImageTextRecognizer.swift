import Foundation
import UIKit
import Vision

enum ImageTextRecognizer {
    static func recognize(_ images: [UIImage]) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    var pages: [String] = []
                    for image in images {
                        guard let cgImage = image.cgImage else { continue }
                        let request = VNRecognizeTextRequest()
                        request.recognitionLevel = .accurate
                        request.usesLanguageCorrection = true
                        request.automaticallyDetectsLanguage = true
                        let preferred = ["en-US", "ro-RO", "tr-TR"]
                        let supported = (try? request.supportedRecognitionLanguages()) ?? ["en-US"]
                        let selected = preferred.filter { supported.contains($0) }
                        if !selected.isEmpty { request.recognitionLanguages = selected }
                        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                        try handler.perform([request])
                        let text = (request.results ?? []).compactMap {
                            $0.topCandidates(1).first?.string
                        }.joined(separator: "\n")
                        pages.append(text)
                    }
                    continuation.resume(returning: pages.joined(separator: "\n"))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
