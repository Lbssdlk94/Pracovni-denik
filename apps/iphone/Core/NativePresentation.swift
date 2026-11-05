import Foundation

// Presentation only: opaque handles, control order and domain validation survive unchanged.
struct NativePresentationGroup: Identifiable {
    enum Kind: Equatable { case fields, actions, content, container }
    let kind: Kind
    let controls: [NativeControl]
    var id: String { controls.first?.id ?? "empty" }
}
enum NativePresentation {
    static func groups(_ controls: [NativeControl], omitting: Set<String> = []) -> [NativePresentationGroup] {
        var groups: [NativePresentationGroup] = []
        for control in controls where !omitting.contains(control.id) {
            let kind: NativePresentationGroup.Kind = control.isInput ? .fields : control.isAction ? .actions : ["text", "caption", "badge"].contains(control.kind) ? .content : .container
            if kind != .container, let previous = groups.last, previous.kind == kind {
                groups[groups.count - 1] = NativePresentationGroup(kind: kind, controls: previous.controls + [control])
            } else { groups.append(NativePresentationGroup(kind: kind, controls: [control])) }
        }
        return groups
    }
}
