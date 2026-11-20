import SwiftUI

private struct APISecondaryFormPreview:View {
    @State private var value:APIValue = .object(["name":.s("Ukázka formuláře"),"notes":.s("Krátká poznámka pouze pro Preview.")])
    var body:some View {
        NavigationStack {
            Form { APISecondaryFormSections(fields:[.text("name","Název",true),.ref("customerId","Zákazník","customers",required:true),.field("dueDate","Termín",.date),.field("notes","Poznámky",.notes)],value:$value,options:["customers":(1...12).map{.object(["id":.s("preview-\($0)"),"name":.s("Zákazník \($0)")])}]) }
                .navigationTitle("Úprava záznamu").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.confirmationAction){Button("Uložit") {}} }
        }.tint(DiaryStyle.accent)
    }
}
#Preview("Formulář · světlý") { APISecondaryFormPreview().preferredColorScheme(.light) }
#Preview("Formulář · tmavý · velký text") { APISecondaryFormPreview().preferredColorScheme(.dark).environment(\.dynamicTypeSize,.accessibility2) }
#Preview("Výběr z katalogu") { APISecondaryChoiceSheet(title:"Zákazník",choices:[APIChoice(id:"preview-a",title:"Zahrada – ukázka"),APIChoice(id:"preview-b",title:"Servis – ukázka")],required:true,value:.constant("preview-a")) }
