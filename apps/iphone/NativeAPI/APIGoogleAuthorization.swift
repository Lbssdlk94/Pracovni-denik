import SwiftUI
import AuthenticationServices
import UIKit

@MainActor
final class APIGoogleAuthorization:NSObject,ObservableObject,ASWebAuthenticationPresentationContextProviding {
    @Published var busy=false
    @Published var message:String?
    private var session:ASWebAuthenticationSession?
    func presentationAnchor(for session:ASWebAuthenticationSession)->ASPresentationAnchor{UIApplication.shared.connectedScenes.compactMap{$0 as? UIWindowScene}.flatMap(\.windows).first(where:{$0.isKeyWindow}) ?? ASPresentationAnchor()}
    func connect(store:APIStore,mode:String,finished:@escaping()->Void)async{
        guard !busy else{return};busy=true;message=nil
        do{
            let scope=store.scope,result=try await store.write("/api/drive/connect",method:"POST",body:.object(["mode":.s(mode),"native":.bool(true)]))
            guard let url=URL(string:result["url"].string),url.scheme=="https",url.host==store.transport.origin.host,url.path=="/api/drive/native-start",let expected=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="state"})?.value else{throw APIError.local("Server nepodporuje bezpečné předání přihlášení.")}
            let auth=ASWebAuthenticationSession(url:url,callbackURLScheme:"pracovnidenik"){[weak self,weak store] callback,error in
                Task{@MainActor in
                    guard let self else{return};self.busy=false;self.session=nil
                    if let error{self.message=(error as? ASWebAuthenticationSessionError)?.code == .canceledLogin ? "Připojení bylo zrušeno." : "Připojení se nepodařilo. Zkuste to znovu.";return}
                    guard let store,scope==store.scope,let callback,callback.scheme=="pracovnidenik",callback.host=="drive-callback",let components=URLComponents(url:callback,resolvingAgainstBaseURL:false),components.queryItems?.first(where:{$0.name=="state"})?.value==expected else{self.message="Účet nebo předání připojení se změnily.";return}
                    let result=components.queryItems?.first(where:{$0.name=="result"})?.value
                    self.message=["connected","folder"].contains(result ?? "") ? "Připojení potvrzeno. Ověřuji stav na serveru." : "Připojení nebylo dokončené."
                    finished()
                }
            }
            session=auth;auth.presentationContextProvider=self;auth.prefersEphemeralWebBrowserSession=true
            guard auth.start()else{session=nil;throw APIError.local("Autorizační okno se nepodařilo otevřít.")}
        }catch{busy=false;message=error.localizedDescription}
    }
    func cancel(){session?.cancel();session=nil;busy=false}
}
