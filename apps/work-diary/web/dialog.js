// Wait for the previous dialog to finish closing before showing its replacement.
// Otherwise its queued close handlers can dispose the newly opened form.
export function closeDialog(modal){
 if(!modal.open)return Promise.resolve();
 return new Promise(resolve=>{modal.addEventListener('close',resolve,{once:true});modal.close();});
}
