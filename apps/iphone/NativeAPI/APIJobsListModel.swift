import SwiftUI

@MainActor final class APIJobsListModel:ObservableObject {
    @Published var rows:[APIValue]=[]
    @Published var loading=false
    @Published var problem:String?
    @Published var cache:APIValue = .null
    @Published var complete=false
    private var ticket=UUID()
    private var scope=""
    private var requestKey=""
    init(previewRows:[APIValue]=[]){rows=previewRows;complete = !previewRows.isEmpty}
    func load(store:APIStore,filters:APIJobsFilters,period:APIJobsPeriod,mine:Bool,refresh:Bool=false)async{
        let id=UUID(),binding=store.scope
        let paths=APIJobsPresentation.paths(filters:filters,period:period,mine:mine,manager:store.manager,userID:store.userID,now:Date())
        let key=paths.joined(separator:"|")
        ticket=id;loading=true;complete=false
        defer{if id==ticket{loading=false}}
        if scope != binding || key != requestKey{rows=[];cache = .null;problem=nil}
        scope=binding;requestKey=key
        var found:[String:APIValue]=[:],metadata:[APIValue]=[]
        do{
            var requests=paths
            if !store.online{
                // Reuse the existing permission-fenced three-month cache. Never
                // persist an unrestricted second copy of jobs or resurrect old IDs.
                await store.prepareJobMonths()
                requests=APIJobMonthCache.months(containing:store.today).map{month in
                    var c=URLComponents(string:paths[0])!;var q=(c.queryItems ?? []).filter{$0.name != "month"};q.append(URLQueryItem(name:"month",value:month));c.queryItems=q;return c.string!
                }
            }
            for base in requests{
                var cursor="",seen=Set<String>()
                repeat{
                    try Task.checkCancellation()
                    guard ticket==id,binding==store.scope else{return}
                    var c=URLComponents(string:base)!;if !cursor.isEmpty{c.queryItems=(c.queryItems ?? [])+[URLQueryItem(name:"cursor",value:cursor)]}
                    let page:APIValue
                    do{page=try await store.get(c.string!,refresh:refresh)}catch{
                        if let e=error as? APIError,[401,403,404].contains(e.status){throw e}
                        if !store.online{break};throw error
                    }
                    guard !Task.isCancelled,ticket==id,binding==store.scope else{return}
                    for job in page["jobs"].array{if found[job.id]==nil || job["version"].int >= found[job.id]!["version"].int{found[job.id]=job}}
                    rows=Array(found.values)
                    if !page["_jobCache"].isNull{metadata.append(page["_jobCache"])}
                    else{metadata.append(.object(["at":.number(Date().timeIntervalSince1970*1000),"offline":.bool(false),"stale":.bool(false)]))}
                    cache=Self.freshness(metadata,offline:!store.online)
                    cursor=page["nextCursor"].string
                    if !cursor.isEmpty,!seen.insert(cursor).inserted{throw APIError.local("Stránkování se změnilo. Obnovte seznam zakázek.")}
                }while !cursor.isEmpty
            }
            guard ticket==id,binding==store.scope else{return}
            complete=store.online
            if !store.online{problem=found.isEmpty ? "Tento výběr není uložený. Po připojení jej obnovte." : "Offline jsou dostupné pouze ověřené uložené měsíce. Starší nebo další zakázky mohou chybět.";complete=false}
            else{problem=nil}
        }catch is CancellationError{}catch{
            guard ticket==id,binding==store.scope else{return}
            if let e=error as? APIError,[401,403,404].contains(e.status){rows=[];cache = .null}
            else{cache=cache.merged(["stale":.bool(true)])}
            problem=error.localizedDescription
        }
    }
    static func freshness(_ values:[APIValue],offline:Bool)->APIValue{
        guard !values.isEmpty else{return .null}
        let at=values.map{$0["at"].double}.min() ?? 0
        return .object(["at":.number(at),"offline":.bool(offline || values.contains{$0["offline"].bool}),"stale":.bool(values.contains{$0["stale"].bool})])
    }
}
