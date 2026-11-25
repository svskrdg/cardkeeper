import SwiftUI
import PhotosUI
import VisionKit

struct ContentView: View {
    @State private var scannerPresented = false
    @State private var scannedPages: [UIImage] = []
    @State private var photoSelection: PhotosPickerItem?
    @State private var imagePreview: UIImage?
    @State private var draft = ContactDraft()
    @State private var hasScan = false
    @State private var working = false
    @State private var duplicates: [String] = []
    @State private var showDuplicates = false
    @State private var showNotice = false
    @State private var notice = ""
    @State private var savedCount = 0
    private let contacts = ContactWriter()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    hero
                    if working { ProgressView("Reading business card locally…").padding() }
                    if hasScan {
                        if let imagePreview {
                            Image(uiImage: imagePreview)
                                .resizable().scaledToFit().frame(maxHeight: 180)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .accessibilityLabel("Scanned business card")
                        }
                        contactFields
                        Button(action: checkAndSave) {
                            Label("Save to iPhone Contacts", systemImage: "person.crop.circle.badge.plus")
                                .fontWeight(.semibold).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(working)
                    } else {
                        ContentUnavailableView("Ready to scan", systemImage: "person.text.rectangle",
                                               description: Text("Scan a business card or choose a photo. Edit the details, then save directly to Contacts."))
                    }
                    if savedCount > 0 {
                        Text("Contacts saved this session: \(savedCount)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Text("Offline OCR • No subscriptions • No servers")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                .padding()
            }
            .navigationTitle("CardKeeper")
            .sheet(isPresented: $scannerPresented) {
                CardScannerView(pages: $scannedPages, isPresented: $scannerPresented) { error in
                    showMessage(error)
                }
            }
            .onChange(of: scannedPages.count) { _, count in
                if count > 0 { Task { await process(scannedPages) } }
            }
            .onChange(of: photoSelection) { _, selected in
                guard let selected else { return }
                Task {
                    do {
                        guard let data = try await selected.loadTransferable(type: Data.self),
                              let image = UIImage(data: data) else {
                            showMessage("Could not open that picture.")
                            return
                        }
                        await process([image])
                    } catch { showMessage(error.localizedDescription) }
                }
            }
            .alert("Possible duplicate", isPresented: $showDuplicates) {
                Button("Cancel", role: .cancel) {}
                Button("Save anyway") { writeContact() }
            } message: {
                Text("Contacts may already contain: \(duplicates.joined(separator: ", ")). Save another copy?")
            }
            .alert("CardKeeper", isPresented: $showNotice) {
                Button("OK", role: .cancel) {}
            } message: { Text(notice) }
        }
    }

    private var hero: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.crop.rectangle.stack")
                .font(.system(size: 45)).foregroundStyle(.tint)
            Text("Business card scanner").font(.title2.bold())
            Text("Camera → Recognize → Review → Save")
                .font(.subheadline).foregroundStyle(.secondary)
            Button {
                if VNDocumentCameraViewController.isSupported { scannerPresented = true }
                else { showMessage("Document scanning is not available on this device.") }
            } label: {
                Label("Scan Business Card", systemImage: "camera.viewfinder")
                    .fontWeight(.semibold).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            PhotosPicker(selection: $photoSelection, matching: .images) {
                Label("Choose Existing Photo", systemImage: "photo")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).controlSize(.large)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private var contactFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Review contact details").font(.headline)
            row("First name", text: $draft.firstName)
            row("Last name", text: $draft.lastName)
            row("Company", text: $draft.company)
            row("Job title", text: $draft.title)
            row("Phone", text: $draft.phone, contentType: .telephoneNumber)
            row("Email", text: $draft.email, contentType: .emailAddress)
            row("Website", text: $draft.website, contentType: .URL)
            row("Address", text: $draft.address)
            DisclosureGroup("Show recognized text") {
                Text(draft.rawText.isEmpty ? "Nothing recognized." : draft.rawText)
                    .font(.caption).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.subheadline)
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private func row(_ label: String, text: Binding<String>, contentType: UITextContentType? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField(label, text: text)
                .textContentType(contentType)
                .textInputAutocapitalization(contentType == .emailAddress || contentType == .URL ? .never : .words)
                .autocorrectionDisabled(contentType == .emailAddress || contentType == .URL)
                .padding(10)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    @MainActor
    private func process(_ images: [UIImage]) async {
        guard !working else { return }
        working = true
        defer { working = false }
        imagePreview = images.first
        do {
            let text = try await ImageTextRecognizer.recognize(images)
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                showMessage("No readable text found. Try a clearer photo.")
                return
            }
            draft = CardParser.parse(text)
            hasScan = true
        } catch { showMessage("Text recognition failed: \(error.localizedDescription)") }
    }

    private func checkAndSave() {
        Task { @MainActor in
            guard !draft.firstName.isEmpty || !draft.lastName.isEmpty || !draft.company.isEmpty else {
                showMessage("Enter at least a name or company first.")
                return
            }
            do {
                guard try await contacts.requestPermission() else {
                    showMessage("Please allow Contacts access in iPhone Settings.")
                    return
                }
                duplicates = contacts.duplicates(for: draft)
                if duplicates.isEmpty { writeContact() }
                else { showDuplicates = true }
            } catch { showMessage("Contacts permission failed: \(error.localizedDescription)") }
        }
    }

    private func writeContact() {
        do {
            try contacts.save(draft)
            savedCount += 1
            hasScan = false
            imagePreview = nil
            scannedPages = []
            photoSelection = nil
            draft = ContactDraft()
            showMessage("Saved successfully to iPhone Contacts.")
        } catch { showMessage("Could not save contact: \(error.localizedDescription)") }
    }

    private func showMessage(_ message: String) {
        notice = message
        showNotice = true
    }
}
