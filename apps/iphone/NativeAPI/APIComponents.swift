import SwiftUI

struct DiaryBadge: View {
    let text: String
    var warning = false
    var body: some View {
        Text(text).font(.caption.weight(.semibold)).foregroundStyle(warning ? DiaryStyle.warning : DiaryStyle.accent)
            .padding(.horizontal, 10).padding(.vertical, 7).background(warning ? Color.orange.opacity(0.12) : DiaryStyle.soft, in: Capsule())
    }
}
struct DiaryTile: View {
    let title: String; let subtitle: String; let symbol: String; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.title2).frame(width: 48, height: 48).background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 5) { Text(title).font(.headline); Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
                Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }.foregroundStyle(DiaryStyle.accent).padding(16).frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 24)).overlay(RoundedRectangle(cornerRadius: 24).stroke(DiaryStyle.accent.opacity(0.09)))
        }.buttonStyle(.plain).accessibilityLabel(title)
    }
}
struct NativeJobCard: View {
    let job: DiaryJob
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if !typeSize.isAccessibilitySize {
                VStack(spacing: 5) {
                    Image(systemName: job.status == "done" ? "checkmark.circle.fill" : job.status == "incomplete" ? "exclamationmark.circle.fill" : "clock")
                        .foregroundStyle(job.status == "incomplete" ? DiaryStyle.warning : DiaryStyle.accent)
                    Text(job.plannedStart.isEmpty ? "—" : job.plannedStart).font(.headline.monospacedDigit())
                }.frame(width: 58).padding(.vertical, 12).background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 16))
            }
            VStack(alignment: .leading, spacing: 7) {
                Text(job.customerLabel).font(.headline).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                if job.title != job.customerLabel { Text(job.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
                HStack(spacing: 7) {
                    Text(job.stateLabel).font(.caption.weight(.semibold)).foregroundStyle(job.status == "incomplete" ? DiaryStyle.warning : DiaryStyle.accent)
                    Text("· \(job.kindLabel)").font(.caption).foregroundStyle(.secondary)
                }
                if !job.gardenName.isEmpty { Text(job.gardenName).font(.caption.weight(.medium)).foregroundStyle(.secondary).lineLimit(2) }
                if !job.address.isEmpty { Label(job.address, systemImage: "mappin").font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
                Text([DiaryDate.localized(job.dueDate), job.compactTime].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                if !job.assignedName.isEmpty { Label(job.assignedName, systemImage: "person").font(.caption).foregroundStyle(.secondary) }
                if job.status == "done" { DiaryBadge(text: job.protocolLabel, warning: job.protocolStatus != "ready") }
                if job.status == "incomplete" { Text("Důvod: \(job.incompleteReason)").font(.callout).foregroundStyle(DiaryStyle.warning).fixedSize(horizontal: false, vertical: true) }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(16).background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 22))
            .accessibilityElement(children: .combine)
    }
}

struct APIEditLease:ViewModifier {
    @ObservedObject var store:APIStore
    @State private var acquired=false
    func body(content:Content)->some View{content.onAppear{if !acquired{acquired=true;store.beginEdit()}}.onDisappear{if acquired{acquired=false;store.endEdit()}}}
}
extension View{func editLease(_ store:APIStore)->some View{modifier(APIEditLease(store:store))}}
