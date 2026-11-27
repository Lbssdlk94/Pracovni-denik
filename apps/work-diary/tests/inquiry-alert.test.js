import test from 'node:test';
import assert from 'node:assert/strict';
import {inquiryAlertMarkup,inquiryAge} from '../web/inquiry-alert.js';
const now=1800000000000;
const latestNew={id:'inquiry-1',firstName:'Jan',lastName:'Novák',city:'Březnice',categoryLabel:'Závlaha',serviceLabel:'Nová realizace',createdAt:now-300000};
test('An empty inbox has no alert; one inquiry opens its own detail',()=>{
 assert.equal(inquiryAlertMarkup({newCount:0,latestNew}), '');
 const html=inquiryAlertMarkup({newCount:1,latestNew},{now});
 assert.match(html,/Jan Novák · Březnice/);assert.match(html,/Závlaha · Nová realizace/);assert.match(html,/data-overview-inquiry="inquiry-1"/);assert.match(html,/Zobrazit poptávku/);assert.doesNotMatch(html,/data-overview-inquiry-list/);
});
test('Several new inquiries open the list, and a racing missing preview never opens an absent record',()=>{
 const html=inquiryAlertMarkup({newCount:3,latestNew},{now});assert.match(html,/Nové poptávky/);assert.match(html,/Nejnovější z 3/);assert.match(html,/data-overview-inquiry-list/);assert.doesNotMatch(html,/data-overview-inquiry=/);
 assert.match(inquiryAlertMarkup({newCount:1,latestNew:null},{now}),/data-overview-inquiry-list/);
});
test('Customer content and identifiers remain text, and invalid dates have no relative label',()=>{
 const html=inquiryAlertMarkup({newCount:1,latestNew:{...latestNew,id:'"><script>',firstName:'<img onerror=alert(1)>',city:'A&B'}},{now});
 assert.doesNotMatch(html,/<script>|<img /);assert.match(html,/&lt;img/);assert.match(html,/A&amp;B/);assert.match(html,/&quot;&gt;&lt;script&gt;/);
 assert.equal(inquiryAge(null,now),'');assert.equal(inquiryAge('invalid',now),'');assert.equal(inquiryAge(now+60000,now),'Právě teď');assert.match(inquiryAge(now-300000,now),/5/);
});
