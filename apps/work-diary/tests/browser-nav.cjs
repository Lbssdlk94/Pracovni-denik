exports.nav=async(page,id)=>{const target=page.locator('.nav [data-page="'+id+'"]');await page.locator('.nav').waitFor();if(page.viewportSize().width<=760&&!(await target.isVisible())){const more=page.locator('[data-mobile-more]');if(await more.getAttribute('aria-expanded')!=='true')await more.click();}await target.click();};
// Job actions now live in the full detail or desktop side panel.
exports.jobAction=async(page,action,selector='[data-job-open]')=>{await page.locator(selector).first().click();await page.locator('#modal[open] [data-job-'+action+'],#job-side-panel [data-panel-'+action+'],#job-side-panel [data-job-'+action+']').first().click();};
// Resolve the actual dependency URL; entry and cloud modules have separate versions.
exports.moduleURL=async(page,name)=>page.evaluate(async name=>{
 const entry=document.querySelector('script[type=module]').src,source=await(await fetch(entry)).text();
 const paths=[...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
 const match=paths.find(path=>new URL(path,entry).pathname.endsWith('/'+name));if(!match)throw Error('Missing application dependency: '+name);return new URL(match,entry).href;
},name);
