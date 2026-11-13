import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import QuickLook
import UIKit

struct NativeAssetImage: View {
    let handle: String; let label: String
    @ObservedObject var store: NativeScreenStore
    var body: some View {
        Group {
            if let data = store.images[handle], let image = UIImage(data: data) { Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14)).accessibilityLabel(label) }
            else { Label(label, systemImage: "photo").font(.callout).foregroundStyle(.secondary) }
        }.task(id: handle) { await store.image(handle) }
    }
}
struct NativeDocumentPreview: View {
    let file: NativePreviewFile
    @Environment(\.dismiss) private var dismiss
    @State private var share = false
    var body: some View {
        NavigationStack {
            NativeQuickLook(url: file.url).navigationTitle("Dokument").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { dismiss() } }
                    ToolbarItem(placement: .primaryAction) { Button { share = true } label: { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Sdílet dokument") }
                }
        }.sheet(isPresented: $share) { FileShare(url: file.url) }
    }
}
struct NativeQuickLook: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController { let controller=QLPreviewController();controller.dataSource=context.coordinator;return controller }
    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url=url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}
struct NativeFilePanel: View {
    let request: NativeFileRequest
    @ObservedObject var store: NativeScreenStore
    @State private var selection: [PhotosPickerItem] = []
    @State private var importing = false
    @State private var camera = false
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                if request.accept.contains("image") {
                    PhotosPicker(selection: $selection, maxSelectionCount: request.multiple ? 40 : 1, matching: .images) { Label("Vybrat fotografie", systemImage: "photo.on.rectangle") }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) { Button { camera=true } label: { Label("Vyfotit", systemImage: "camera") } }
                }
                Button { importing=true } label: { Label("Vybrat ze Souborů", systemImage: "folder") }
                if loading { ProgressView("Připravuji soubory…") }
                if let error { Text(error).foregroundStyle(.red) }
            }.disabled(loading).navigationTitle(request.label).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { Task { await store.cancelFile(request) } } } }
        }.interactiveDismissDisabled()
            .onChange(of: selection) { _, items in Task {
                loading=true;defer { loading=false }
                do {
                    for (index,item) in items.enumerated() {
                        guard let data=try await item.loadTransferable(type:Data.self) else { throw DiaryBridgeError(message:"Fotografii se nepodařilo načíst.") }
                        let type=item.supportedContentTypes.first ?? .jpeg
                        try await store.prepareFile(request,data:data,name:UUID().uuidString+"."+(type.preferredFilenameExtension ?? "jpg"),type:type.preferredMIMEType ?? "image/jpeg",last:index==items.count-1)
                    }
                } catch { self.error=error.localizedDescription }
            } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: request.multiple) { result in Task {
                do {
                    let urls=try result.get()
                    for (index,url) in urls.enumerated() { let access=url.startAccessingSecurityScopedResource();defer { if access { url.stopAccessingSecurityScopedResource() } };try await store.prepareFile(request,url:url,last:index==urls.count-1) }
                } catch { self.error=error.localizedDescription }
            } }
            .sheet(isPresented: $camera) { NativeCamera { image in
                camera=false
                if let data=image?.jpegData(compressionQuality:0.9) { Task { loading=true;defer{loading=false};do { try await store.prepareFile(request,data:data,name:"Fotografie.jpg",type:"image/jpeg",last:true) } catch { self.error=error.localizedDescription } } }
            } }
    }
}
struct NativeCamera: UIViewControllerRepresentable {
    let completion: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion:completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController { let picker=UIImagePickerController();picker.sourceType = .camera;picker.delegate=context.coordinator;return picker }
    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let completion: (UIImage?) -> Void
        init(completion: @escaping (UIImage?) -> Void) { self.completion=completion }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey:Any]) { completion(info[.originalImage] as? UIImage) }
    }
}
