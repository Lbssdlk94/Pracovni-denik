import SwiftUI

struct APIProtocolCatalog:View {
    @ObservedObject var store:APIStore
    let items:[APIValue],categories:[APIValue]
    @Binding var lines:APIValue
    @Environment(\.dismiss) private var dismiss
    @State private var search=""
    @State private var category="all"
    @State private var filter="all"
    @State private var favorites:Set<String>=[]
    @State private var recent:[String]=[]
    @State private var quantities:[String:String]=[:]
    @State private var invalid=Set<String>()
    @State private var problem:String?
    private let preferences="local:protocol-material-preferences"
    var shown:[APIValue]{items.filter{row in (category=="all" || row["categoryId"].string==category) && (filter != "favorites" || favorites.contains(row.id)) && (filter != "recent" || recent.contains(row.id)) && (search.isEmpty || (row.title+" "+row["sku"].string).localizedStandardContains(search))}.sorted{a,b in if filter=="recent"{return (recent.firstIndex(of:a.id) ?? 100)<(recent.firstIndex(of:b.id) ?? 100)};return a.title.localizedStandardCompare(b.title) == .orderedAscending}}
    var body:some View{NavigationStack{List{
        Section{Picker("Výběr",selection:$filter){Text("Vše").tag("all");Text("Oblíbené").tag("favorites");Text("Naposledy").tag("recent")}.pickerStyle(.segmented);Picker("Kategorie",selection:$category){Text("Všechny kategorie").tag("all");ForEach(categories.filter{$0["active"].bool},id:\.id){Text($0.title).tag($0.id)}}}
        if shown.isEmpty{ContentUnavailableView("Žádný odpovídající materiál",systemImage:"shippingbox",description:Text("Změňte hledání nebo kategorii."))}
        ForEach(shown,id:\.id){item in catalogRow(item)}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Použitý materiál").navigationBarTitleDisplayMode(.inline).searchable(text:$search,prompt:"Název nebo produktový kód").toolbar{ToolbarItem(placement:.confirmationAction){Button("Hotovo"){dismiss()}.disabled(!invalid.isEmpty)}}.safeAreaInset(edge:.bottom){APIProtocolMaterialTotals(lines:lines).padding(12).background(.bar)}.onAppear{let p=store.vault?.state.cache[preferences] ?? .null;favorites=Set(p["favorites"].array.map(\.string));recent=p["recent"].array.map(\.string)}}}
    private func catalogRow(_ item:APIValue)->some View {
        VStack(alignment:.leading,spacing:8){HStack{VStack(alignment:.leading,spacing:4){Text(item.title).font(.headline);Text([item["sku"].string,item["unit"].string].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption).foregroundStyle(.secondary);Text(APIFormat.money(item["priceMinor"],currency:item["currency"].string)+" / "+item["unit"].string).font(.caption)};Spacer();Button{if favorites.contains(item.id){favorites.remove(item.id)}else{favorites.insert(item.id)};persistPreferences()}label:{Image(systemName:favorites.contains(item.id) ? "star.fill" : "star")}.buttonStyle(.borderless).frame(minWidth:44,minHeight:44).accessibilityLabel("Oblíbené: "+item.title)}
            HStack{Button{step(item,-1)}label:{Image(systemName:"minus.circle")}.accessibilityLabel("Ubrat: "+item.title);TextField("Množství",text:Binding(get:{quantities[item.id] ?? current(item)},set:{text in quantities[item.id]=text;set(item,text)})).keyboardType(.decimalPad).multilineTextAlignment(.center).textFieldStyle(.roundedBorder).accessibilityIdentifier("protocol-quantity-"+item.id);Text(item["unit"].string).font(.caption);Button{step(item,1)}label:{Image(systemName:"plus.circle.fill")}.accessibilityLabel("Přidat: "+item.title)}.buttonStyle(.borderless).frame(minHeight:44)
            if invalid.contains(item.id){Text("Zadejte 0 nebo kladné množství, nejvýše 3 desetinná místa.").font(.caption).foregroundStyle(DiaryStyle.warning)}
        }.padding(.vertical,4)
    }
    private func current(_ item:APIValue)->String{lines.array.first{$0["itemId"].string==item.id}?["quantity"].string ?? "0"}
    private func step(_ item:APIValue,_ amount:Double){let q=max(0,(Double(current(item)) ?? 0)+amount),text=APIValue.number(q).string;quantities[item.id]=text;set(item,text)}
    private func set(_ item:APIValue,_ text:String){
        do{if text=="0"{lines = .array(lines.array.filter{$0["itemId"].string != item.id})}else{let q=try APIProtocolLogic.quantity(text);if let index=lines.array.firstIndex(where:{$0["itemId"].string==item.id}){lines=try APIProtocolLogic.setQuantity(text,index:index,lines:lines)}else{lines=try APIMaterialSelection.add(item,to:lines,quantity:String(q))};recent.removeAll{$0==item.id};recent.insert(item.id,at:0);recent=Array(recent.prefix(20));persistPreferences()};invalid.remove(item.id)}catch{invalid.insert(item.id)}
    }
    private func persistPreferences(){do{guard let vault=store.vault,!store.isRolePreview else{return};vault.state.cache[preferences] = .object(["favorites":.array(favorites.sorted().map{.s($0)}),"recent":.array(recent.map{.s($0)})]);try vault.persist()}catch{problem=error.localizedDescription}}
}
struct APIProtocolMaterialTotals:View {
    let lines:APIValue
    var body:some View{let groups=Dictionary(grouping:lines.array,by:{$0["currency"].string});VStack(alignment:.leading,spacing:4){ForEach(groups.keys.sorted(),id:\.self){currency in HStack{Text("Materiál celkem");Spacer();Text(APIFormat.money(.n((groups[currency] ?? []).reduce(0){$0+APIProtocolPDF.lineTotal($1)}),currency:currency)).fontWeight(.bold)}}}.font(.subheadline).accessibilityIdentifier("protocol-material-total")}
}
struct APIProtocolMaterialLine:View {
    @Binding var lines:APIValue
    let index:Int
    @State private var raw:String?
    @State private var problem:String?
    var body:some View{if lines.array.indices.contains(index){let line=lines.array[index];VStack(alignment:.leading,spacing:6){HStack{Text(line["name"].string).font(.subheadline.weight(.semibold));Spacer();Button(role:.destructive){remove()}label:{Image(systemName:"trash")}.buttonStyle(.borderless).frame(minWidth:44,minHeight:44).accessibilityLabel("Odebrat "+line["name"].string)};HStack{TextField("Množství",text:Binding(get:{raw ?? line["quantity"].string},set:{raw=$0;do{lines=try APIProtocolLogic.setQuantity($0,index:index,lines:lines);problem=nil}catch{problem=error.localizedDescription}})).keyboardType(.decimalPad).textFieldStyle(.roundedBorder).frame(maxWidth:100).accessibilityLabel("Množství: "+line["name"].string);Text(line["unit"].string);Spacer();Text(APIFormat.money(.n(APIProtocolPDF.lineTotal(line)),currency:line["currency"].string))};Text(APIFormat.money(line["priceMinor"],currency:line["currency"].string)+" / "+line["unit"].string+" · uložená cena").font(.caption).foregroundStyle(.secondary);if let problem{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning)}}.contextMenu{Button("Odebrat položku",role:.destructive){remove()}}.swipeActions(allowsFullSwipe:false){Button("Odebrat",role:.destructive){remove()}}}}
    private func remove(){var a=lines.array;guard a.indices.contains(index)else{return};a.remove(at:index);lines = .array(a)}
}
