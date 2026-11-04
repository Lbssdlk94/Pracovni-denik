import SwiftUI

struct WatchPhoneSettings: View {
    @ObservedObject var watch = WatchPhoneCoordinator.shared
    var body: some View {
        NavigationStack {
            List {
                Section("Apple Watch") {
                    Label(watch.paired ? "Hodinky jsou spárované" : "Spárujte Apple Watch v aplikaci Watch", systemImage:"applewatch")
                    Label(watch.installed ? "Pracovní deník je v hodinkách" : "Nainstalujte Pracovní deník v aplikaci Watch",systemImage:"apps.iphone")
                    Text(watch.reachable ? "Hodinky komunikují s iPhonem." : "Pro spojení otevřete deník na hodinkách i iPhonu.")
                    if let at = watch.lastSync { Text("Poslední spojení: \(at.formatted(date:.omitted,time:.shortened))").font(.footnote) }
                    if let problem = watch.problem { Text(problem).foregroundStyle(.orange) }
                }
                Section("Co hodinky umí") {
                    Text("Dnešní přidělené zakázky, převzetí, přesný čas příjezdu, zahájení a dokončení běžné zakázky.")
                    Text("Servis s povinným protokolem dokončíte na iPhonu. Připravenou SMS také zkontrolujete a odešlete na telefonu.")
                }
                Section("Přístup a oznámení") {
                    Text("Hodinky používají účet přihlášený v této aplikaci. Heslo ani firemní soubory se do hodinek nepřenášejí. Pro změny potřebují spojení s iPhonem a internet.")
                    Text("Systémová oznámení se mohou zrcadlit z iPhonu podle nastavení Apple Watch. Je potřeba zprovozněné APNs a podepsaná aplikace; samotná instalace hodinek doručování nezapne.")
                }
            }.navigationTitle("Apple Watch").toolbar { ToolbarItem(placement:.confirmationAction){ Button("Hotovo"){watch.showSettings=false} } }
        }.tint(DiaryStyle.accent)
    }
}
