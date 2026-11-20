import XCTest
@testable import PracovniDenik
final class APISecondaryLayoutTests:XCTestCase {
    func testEveryExistingFormFieldSurvivesSectionGroupingExactlyOnce(){
        for entity in APIEntity.allCases {
            let fields=APIResource(entity:entity).fields,rendered=APISecondaryLayout.groups(fields).flatMap(\.fields)
            XCTAssertEqual(rendered.count,fields.count,entity.rawValue)
            XCTAssertEqual(Set(rendered.map(\.id)),Set(fields.map(\.id)),entity.rawValue)
            XCTAssertEqual(Set(rendered.filter(\.required).map(\.id)),Set(fields.filter(\.required).map(\.id)),entity.rawValue)
        }
    }
    func testSearchableReferencesRetainOriginalIdentifiersAndSupportCzechSearch(){
        let choices=[APIChoice(id:"customer-a",title:"Závlaha – Černý"),APIChoice(id:"customer-b",title:"Zahrada Novák")]
        XCTAssertEqual(APISecondaryLayout.matching(choices,query:"cerny").map(\.id),["customer-a"])
        XCTAssertEqual(APISecondaryLayout.matching(choices,query:"").map(\.id),choices.map(\.id))
        XCTAssertTrue(APISecondaryLayout.matching(choices,query:"nenalezeno").isEmpty)
    }
}
