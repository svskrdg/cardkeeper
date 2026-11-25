import Foundation
import Contacts

final class ContactWriter {
    private let store = CNContactStore()
    private let keys: [CNKeyDescriptor] = [
        CNContactIdentifierKey as CNKeyDescriptor,
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor
    ]

    func requestPermission() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            store.requestAccess(for: .contacts) { granted, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: granted) }
            }
        }
    }

    func duplicates(for draft: ContactDraft) -> [String] {
        var result: [String] = []
        var identifiers = Set<String>()
        var predicates: [NSPredicate] = []
        if !draft.email.isEmpty {
            predicates.append(CNContact.predicateForContacts(matchingEmailAddress: draft.email))
        }
        if !draft.phone.isEmpty {
            predicates.append(CNContact.predicateForContacts(matching: CNPhoneNumber(stringValue: draft.phone)))
        }
        for predicate in predicates {
            guard let contacts = try? store.unifiedContacts(matching: predicate, keysToFetch: keys) else { continue }
            for contact in contacts where identifiers.insert(contact.identifier).inserted {
                let name = "\(contact.givenName) \(contact.familyName)".trimmingCharacters(in: .whitespaces)
                result.append(name.isEmpty ? contact.organizationName : name)
            }
        }
        return result
    }

    func save(_ draft: ContactDraft) throws {
        let contact = CNMutableContact()
        contact.givenName = draft.firstName
        contact.familyName = draft.lastName
        contact.organizationName = draft.company
        contact.jobTitle = draft.title
        if !draft.phone.isEmpty {
            contact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile,
                                                    value: CNPhoneNumber(stringValue: draft.phone))]
        }
        if !draft.email.isEmpty {
            contact.emailAddresses = [CNLabeledValue(label: CNLabelWork, value: draft.email as NSString)]
        }
        if !draft.website.isEmpty {
            contact.urlAddresses = [CNLabeledValue(label: CNLabelURLAddressHomePage,
                                                  value: draft.website as NSString)]
        }
        if !draft.address.isEmpty {
            let address = CNMutablePostalAddress()
            address.street = draft.address
            contact.postalAddresses = [CNLabeledValue(label: CNLabelWork, value: address)]
        }
        let request = CNSaveRequest()
        request.add(contact, toContainerWithIdentifier: nil)
        try store.execute(request)
    }
}
