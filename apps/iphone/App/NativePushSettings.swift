import SwiftUI
import UserNotifications

struct NativePushSettings: View {
    @ObservedObject var push: NativePushController
    @State private var jobs = true
    @State private var attendance = true
    @Environment(\.dismiss) private var dismiss
    var allowed: Bool { [.authorized,.provisional,.ephemeral].contains(push.permission) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Oznámení v tomto iPhonu") {
                    Label(push.status?.registered == true && allowed ? "Zapnuto pro přihlášený účet" : "Zatím nezapnuto",systemImage:"bell.badge")
                    if push.status?.enabled == false {Text("Upozornění jsou pro firmu vypnutá.")}
                    else if push.status == nil {Text("Nastavení oznámení zatím není ověřené.")}
                    else if push.status?.configured != true { Text("Nativní push čeká na nastavení Apple Developer klíče na serveru.").accessibilityIdentifier("native-push-not-configured") }
                    if push.permission == .denied {
                        Text("Oznámení jsou zakázaná v nastavení iPhonu.")
                        Button("Otevřít nastavení iPhonu"){if let url=URL(string:UIApplication.openNotificationSettingsURLString){UIApplication.shared.open(url)}}
                    }
                    Button("Zapnout oznámení"){Task{await push.enable()}}.disabled(push.busy || push.status?.configured != true || push.status?.enabled == false || push.permission == .denied)
                    if push.status?.registered == true {
                        Button("Poslat zkušební oznámení"){Task{await push.test()}}.disabled(push.busy)
                        Button("Vypnout v tomto telefonu",role:.destructive){Task{await push.disable()}}.disabled(push.busy)
                    }
                }
                Section("Jaká upozornění dostávat") {
                    Toggle("Zakázky a vozidla",isOn:$jobs)
                    Toggle("Docházka",isOn:$attendance)
                    Button("Uložit výběr"){Task{await push.preferences(jobs:jobs,attendance:attendance)}}
                    Text("Výběr platí pro váš účet na všech zařízeních. Historie v centru zůstává.").font(.footnote)
                }.disabled(push.busy || push.status?.enabled == false)
                Section {
                    Text("Na zamčeném displeji se nezobrazují jména, adresy ani pracovní údaje. Klepnutí otevře centrum a znovu ověří přístup.")
                    Text("Povolení telefonu samo nestačí. Je potřeba podepsaná aplikace s Push Notifications a aktivní Apple konfigurace serveru.")
                    if let message=push.message {Text(message).accessibilityIdentifier("native-push-status")}
                    if push.busy {ProgressView("Ověřuji nastavení…")}
                    Button("Obnovit stav"){Task{await push.refresh()}}.disabled(push.busy)
                }
            }.navigationTitle("Push upozornění").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}
        }.tint(DiaryStyle.accent).task{await push.refresh();if let p=push.status?.preferences{jobs=p.jobs;attendance=p.attendance}}
            .onChange(of:push.status?.preferences){_,p in if let p{jobs=p.jobs;attendance=p.attendance}}
    }
}
