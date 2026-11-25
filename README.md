# CardKeeper

A real, standalone iPhone business-card scanner, written in SwiftUI. This is **not** a web app or Shortcut.

## Features
- Scan physical business cards using Apple's document camera and automatic cropping
- Read card text locally with Apple Vision (no subscription or OCR API)
- Select an existing card image from Photos
- Review/edit name, organization, job title, phone, email, website and address
- Detect possible duplicates and save directly to Apple Contacts
- No server, telemetry, ads, paid SDK, or scanned-card uploads

## Build an unsigned IPA in GitHub Actions
1. Open **Actions → Build CardKeeper IPA** on this repository.
2. It automatically builds after the workflow is committed (or select **Run workflow**).
3. Download the **CardKeeper-unsigned-ipa** artifact and extract **CardKeeper-unsigned.ipa**.

An unsigned IPA **cannot be installed directly**. Sign it using an iPhone-compatible, free-Apple-ID IPA installer; iOS 27 may support on-device setup, but this depends on the chosen third-party installation tool. Free personal signing is generally valid for seven days and needs refreshing. Never share your Apple password or device-pairing credentials here.

The GitHub project build uses XcodeGen and Xcode on a macOS GitHub-hosted runner. GitHub's included Actions allowance applies to private repositories; monitor usage to keep total cost zero.

## Scope / limitations
- v1 saves one primary phone number and email address.
- If an existing email or phone matches, the user must decide whether to save another contact.
- Card images are not retained after saving.
- OCR parsing is heuristic; always review the fields before saving.
- The project must successfully compile in GitHub Actions before describing the artifact as build-tested. Device functionality remains untested until installed on an actual iPhone.

## Privacy
No backend. All OCR happens on-device. Contacts access is requested only when saving. The app uses native Apple frameworks: SwiftUI, VisionKit, Vision, Contacts, PhotosUI.

## Sources
`CardKeeper/CardKeeperApp.swift`, `ContentView.swift`, `CardScannerView.swift`, `ImageTextRecognizer.swift`, `CardParser.swift`, and `ContactWriter.swift`.

## Building locally on a Mac (optional)
```sh
brew install xcodegen
xcodegen generate
xcodebuild -project CardKeeper.xcodeproj -scheme CardKeeper -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO build
```
