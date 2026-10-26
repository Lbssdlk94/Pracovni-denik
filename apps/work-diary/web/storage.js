import {openLocalDatabase,finishLocalTransaction} from './io.js?v=workspace-roles-v1';
let database,opening;
export function openDatabase(){return database?Promise.resolve(database):opening||(opening=openLocalDatabase('zavlahovy-denik',1,r=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('settings');}).then(db=>{database=db;db.onversionchange=()=>{db.close();database=null;opening=null;};return db;}).catch(error=>{opening=null;throw error;}));}
async function transact(stores,mode,callback){const db=await openDatabase(),tx=db.transaction(stores,mode);let result;try{result=callback(tx);}catch(error){tx.abort();throw error;}return finishLocalTransaction(tx,result);}
export const getRecords=()=>transact(['records'],'readonly',tx=>tx.objectStore('records').getAll());
export const saveRecord=record=>transact(['records'],'readwrite',tx=>tx.objectStore('records').put(record));
export const deleteRecord=id=>transact(['records'],'readwrite',tx=>tx.objectStore('records').delete(id));
export const getZones=()=>transact(['settings'],'readonly',tx=>tx.objectStore('settings').get('zones'));
export const saveZones=zones=>transact(['settings'],'readwrite',tx=>tx.objectStore('settings').put(zones,'zones'));
export const restoreBackup=(records,zones)=>transact(['records','settings'],'readwrite',tx=>{records.forEach(r=>tx.objectStore('records').put(r));tx.objectStore('settings').put(zones,'zones');});
