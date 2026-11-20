import Foundation

// Isolated native previews and test transport only. Production never uses these rows.
enum APIJobsFixture {
    static func examples(_ base:APIValue,now:Date=Date())->[APIValue]{
        let c=APIJobsPresentation.calendar,today=APIJobsPresentation.day(now)
        let old=APIJobsPresentation.day(c.date(byAdding:.day,value:-50,to:now)!),tomorrow=APIJobsPresentation.selectedDay(.tomorrow,now:now)
        let specs=[("fixture-progress","Pan Petřík","in_progress","installation",old,45),
                   ("fixture-travel","Paní Bambasová","on_way","service",today,-1),
                   ("fixture-next","Pan Novotný","planned","service",today,-1),
                   ("fixture-approval","Paní Malá","planned","survey",today,-1),
                   ("fixture-incomplete","Pan Dlouhý","incomplete","installation",today,10),
                   ("fixture-done","Pan Veselý","done","service",today,100),
                   ("fixture-tomorrow","Pan Krátký","planned","installation",tomorrow,-1)]
        return specs.enumerated().map{index,spec in
            let (id,name,status,type,date,percent)=spec
            return base.merged(["id":.s(id),"title":.s((type=="installation" ? "Realizace – " : "Servis – ")+name),"customerName":.s(name),"customerId":.s("customer-"+String(index+1)),"status":.s(status),"jobType":.s(type),"dueDate":.s(date),"plannedStart":.s(String(format:"%02d:00",8+index)),"arrivalWindowStart":.s(""),"arrivalWindowEnd":.s(""),"completionPercent":percent<0 ? .null : .n(percent),"serviceApproval":.s(id=="fixture-approval" ? "pending" : "confirmed"),"assignedTo":.s("fixture-owner"),"assignedTos":.array([.s("fixture-owner")]),"assignedName":.s("Luboš – ukázka"),"handoffs":.array([.object(["userId":.s("fixture-owner"),"name":.s("Luboš – ukázka")])]),"customerContact":.object(["id":.s("customer-"+String(index+1)),"name":.s(name),"phones":.array([.object(["number":.s("+420000000000")])])]),"updatedAt":.number(now.timeIntervalSince1970*1000-Double(index)*60000),"version":.n(1)])
        }
    }
    static func filter(_ source:[APIValue],query:[String:String],userID:String,manager:Bool)->[APIValue]{
        source.filter{job in
            if !manager,job["assignedTo"].string != userID,!job["assignedTos"].array.contains(.s(userID)){return false}
            if let state=query["state"],state != "all",state != "active",job["status"].string != state{return false}
            if query["state"]=="active",job["status"].string=="done"{return false}
            if let kind=query["type"],job["jobType"].string != kind{return false}
            if let person=query["assignee"],job["assignedTo"].string != person,!job["assignedTos"].array.contains(.s(person)){return false}
            if let after=query["after"],job["dueDate"].string<after{return false}
            if let discipline=query["discipline"],discipline != "all",job["discipline"].string != discipline{return false}
            if let q=query["q"],!["title","customerName","address"].contains(where:{APIJobsPresentation.normalize(job[$0].string).contains(APIJobsPresentation.normalize(q))}){return false}
            if let p=query["protocol"]{if job["status"].string != "done"{return false};let value=job["protocolStatus"].string;if p=="unfinished"{if !["missing","draft"].contains(value){return false}}else if value != p{return false}}
            return true
        }
    }
}
