import SwiftUI

struct APIPhotoGrid: View {
    @ObservedObject var store: APIStore
    let photos: [APIValue]
    @State private var preview: APIFile?
    @State private var problem: String?
    @State private var opening = ""
    var body: some View {
        VStack(alignment:.leading,spacing:8) {
        LazyVGrid(columns:[GridItem(.adaptive(minimum:130),spacing:10)],spacing:10) {
            ForEach(photos,id:\.id) { photo in
                Button { Task { await open(photo) } } label: {
                    VStack(alignment:.leading,spacing:6) {
                        APIAuthenticatedImage(store:store,path:APIPhotoPaths.preview(photo),version:photo["version"],maxPixels:480,fallbackPath:photo["url"].string)
                            .frame(maxWidth:.infinity,minHeight:100,maxHeight:120).clipped()
                        Text(photo["name"].string.isEmpty ? "Fotografie" : photo["name"].string).font(.caption).lineLimit(1)
                        if opening==photo.id { ProgressView() }
                    }.padding(8).frame(maxWidth:.infinity,minHeight:130)
                        .background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:14))
                }.diaryBubble(.thumbnail).accessibilityLabel("Otevřít fotografii "+photo["name"].string)
            }
        }
        if let problem { Text(problem).font(.footnote).foregroundStyle(DiaryStyle.warning) }
        }.sheet(item:$preview) { file in
            APIQuickLook(url:file.url).onDisappear { try? FileManager.default.removeItem(at:file.url.deletingLastPathComponent()) }
        }
    }
    private func open(_ photo:APIValue) async {
        guard opening.isEmpty else { return }
        opening=photo.id;defer { opening="" }
        let scope=store.scope
        do {
            let result=try await store.file(photo["url"].string,version:photo["version"])
            guard scope==store.scope else { return }
            preview=APIFile(url:APIImage.temporary(result.data,name:photo["name"].string.isEmpty ? "Fotografie.jpg" : photo["name"].string))
            problem=nil
        } catch { if scope==store.scope { problem=error.localizedDescription } }
    }
}
