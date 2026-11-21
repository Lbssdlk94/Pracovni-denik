import SwiftUI

// Catalogue references remain identifiers; previously saved prices are never looked up again.
enum APIMaterialSelection {
    static func add(_ item:APIValue,to lines:APIValue,quantity:String)throws->APIValue {
        guard let amount=Double(quantity.replacingOccurrences(of:",",with:".")),amount.isFinite,amount>0,amount<=1000000,abs(amount*1000-(amount*1000).rounded())<0.00001 else{throw APIError.local("Zadejte kladné množství nejvýše se třemi desetinnými místy.")}
        var rows=lines.array
        if let index=rows.firstIndex(where:{$0["itemId"].string==item.id}){
            let total=rows[index]["quantity"].double+amount
            guard total<=1000000 else{throw APIError.local("Celkové množství materiálu je příliš vysoké.")}
            // Keep the line's original revision and immutable commercial snapshot.
            rows[index]["quantity"] = .number((total*1000).rounded()/1000)
        }else{rows.append(item.merged(["itemId":.s(item.id),"itemVersion":item["version"],"quantity":.number(amount)]))}
        return .array(rows)
    }
    static func duplicateGroups(_ rows:[APIValue])->[[APIValue]]{
        let active=rows.filter{$0["active"].bool}
        let grouped=Dictionary(grouping:active){row in [row["name"].string.precomposedStringWithCanonicalMapping.trimmingCharacters(in:.whitespacesAndNewlines).lowercased(with:Locale(identifier:"cs_CZ")),row["priceMinor"].string,row["currency"].string,row["unit"].string].joined(separator:"\u{001F}")}
        return grouped.values.filter{$0.count>1}.map{$0.sorted{$0.id<$1.id}}.sorted{$0[0].title.localizedStandardCompare($1[0].title) == .orderedAscending}
    }
}
struct APIMaterialReview:View {
    @ObservedObject var store:APIStore
    @State private var rows:[APIValue]=[]
    @State private var categories:[APIValue]=[]
    @State private var selection:APIMaterialReviewGroup?
    @State private var problem:String?
    var body:some View{List{
        Text("Stejný název ani cena neznamená stejný výrobek. Nejdříve zkontrolujte kategorii a kód. Parametry lze doplnit v detailu materiálu.").font(.footnote)
        ForEach(Array(APIMaterialSelection.duplicateGroups(rows).enumerated()),id:\.offset){_,group in Button{selection=APIMaterialReviewGroup(rows:group)}label:{VStack(alignment:.leading){Text(group[0].title).font(.headline);Text("\(group.count) položek · "+APIFormat.money(group[0]["priceMinor"],currency:group[0]["currency"].string)).font(.caption)}}.frame(minHeight:44)}
        if APIMaterialSelection.duplicateGroups(rows).isEmpty{Text("Žádné položky se shodným názvem, cenou, měnou a jednotkou.")}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.secondaryChrome().navigationTitle("Kontrola podobných položek").task(id:store.revision){do{rows=try await APIDomainLogic.referenceRows("allMaterials",store:store);categories=(try await store.get("/api/materials"))["categories"].array}catch{problem=error.localizedDescription}}
        .sheet(item:$selection){group in APIMaterialPreferredEditor(store:store,rows:group.rows,categories:categories)}
    }
}
struct APIMaterialReviewGroup:Identifiable{let id=UUID();let rows:[APIValue]}
struct APIMaterialPreferredEditor:View {
    @ObservedObject var store:APIStore
    let rows:[APIValue]
    let categories:[APIValue]
    @Environment(\.dismiss) private var dismiss
    @State private var primary=""
    @State private var confirm=false
    @State private var busy=false
    @State private var problem:String?
    var body:some View{NavigationStack{Form{
        Section("Zkontrolujte rozdíly"){ForEach(rows,id:\.id){row in VStack(alignment:.leading,spacing:6){Text(row.title).font(.headline);Text("Kategorie: "+(categories.first{$0.id==row["categoryId"].string}?.title ?? "Neuvedena"));Text(row["sku"].string.isEmpty ? "Kód nebo rozměr není vyplněný" : row["sku"].string);Text(APIFormat.money(row["priceMinor"],currency:row["currency"].string)+" / "+row["unit"].string);NavigationLink("Otevřít a doplnit variantu"){APIEntityDetail(store:store,resource:APIResource(entity:.materials),initial:row)}}}}
        Section("Pouze pro skutečné duplicity"){Picker("Hlavní položka",selection:$primary){Text("Vyberte po kontrole").tag("");ForEach(rows,id:\.id){Text($0.title+" · "+($0["sku"].string.isEmpty ? $0.id : $0["sku"].string)).tag($0.id)}};Text("Ostatní položky se deaktivují pro nový výběr. Původní protokoly, ceny a odkazy zůstanou zachované.").font(.footnote);Button("Ponechat ve výběru jen hlavní položku"){confirm=true}.disabled(primary.isEmpty || busy)}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Porovnání materiálu").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.confirmationDialog("Potvrzujete skutečnou duplicitu?",isPresented:$confirm,titleVisibility:.visible){Button("Deaktivovat ostatní po kontrole",role:.destructive){Task{await save()}};Button("Zrušit",role:.cancel){}}}
    func save()async{busy=true;defer{busy=false};do{_ = try await store.write("/api/materials/preferred",method:"POST",body:.object(["primaryId":.s(primary),"items":.array(rows.map{$0.selecting(["id","version"])})]));dismiss()}catch{problem=error.localizedDescription}}
}
