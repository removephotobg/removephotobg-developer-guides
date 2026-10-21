import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import process from 'node:process';
import {URL} from 'node:url';
const root=resolve(process.argv[2]??'.'),output=join(root,'public'),manifest=JSON.parse(readFileSync(join(output,'deployment.json'),'utf8'));
const base=new URL(manifest.siteUrl),htmlFiles=[];
function scan(path){for(const d of readdirSync(path,{withFileTypes:true})){if(d.isSymbolicLink())throw Error('OUTPUT_LINK_FORBIDDEN');const full=join(path,d.name);if(d.isDirectory())scan(full);else if(d.name.endsWith('.html'))htmlFiles.push(full);}}
scan(output);
for(const path of htmlFiles){
 const html=readFileSync(path,'utf8');
 const current=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
 if(!/<html lang="en"/.test(html)||!/<meta name="description" content="[^"]+"/.test(html)||!/<link rel="canonical" href="https?:\/\//.test(html))throw Error('SEO_METADATA_MISSING');
 for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  const u=new URL(m[1],current??base);
  if(u.origin!==base.origin)continue;
  if(!u.pathname.startsWith(base.pathname))throw Error('INTERNAL_BASE_PATH_INVALID');
  const relative=decodeURIComponent(u.pathname.slice(base.pathname.length));
  if(relative.includes('..')||relative.includes('\\'))throw Error('INTERNAL_PATH_INVALID');
  const target=u.pathname.endsWith('/')?join(output,relative,'index.html'):join(output,relative);
  if(!existsSync(target))throw Error('INTERNAL_ASSET_OR_LINK_MISSING:'+relative);
  if(u.hash&&!readFileSync(target,'utf8').includes('id="'+decodeURIComponent(u.hash.slice(1))+'"'))throw Error('INTERNAL_FRAGMENT_MISSING');
 }
}
for(const name of ['sitemap.xml','robots.txt','rss.xml','search.json','deployment.json','assets/social.png'])if(!existsSync(join(output,name)))throw Error('REQUIRED_OUTPUT_MISSING:'+name);
const sitemap=readFileSync(join(output,'sitemap.xml'),'utf8');
for(const a of manifest.articles)if(!sitemap.includes(new URL('guides/'+a.slug+'/',base).href))throw Error('SITEMAP_ARTICLE_MISSING');
process.stdout.write(JSON.stringify({validated:true,pages:htmlFiles.length,articles:manifest.articles.length,internalLinks:true,seo:true})+'\n');
