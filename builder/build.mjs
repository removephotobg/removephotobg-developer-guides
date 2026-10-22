import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import {marked} from 'marked';
import sanitizeHtml from 'sanitize-html';
import hljs from 'highlight.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const articleHash=a=>createHash('sha256').update(JSON.stringify(a)).digest('hex');
export function validateArticle(a){
 if(!a||typeof a!=='object'||!Object.keys(a).every(k=>['slug','title','description','category','tags','publishedAt','content'].includes(k)))throw Error('ARTICLE_SCHEMA_INVALID');
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)||a.slug.length>160)throw Error('ARTICLE_SLUG_INVALID');
 for(const [key,min,max]of [['title',10,180],['description',30,200],['category',3,80],['content',1000,60000]])if(typeof a[key]!=='string'||a[key].length<min||a[key].length>max)throw Error('ARTICLE_'+key.toUpperCase()+'_INVALID');
 if(!Array.isArray(a.tags)||a.tags.length>6||a.tags.some(t=>typeof t!=='string'||t.length<2||t.length>40||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)))throw Error('ARTICLE_TAGS_INVALID');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.publishedAt)||!Number.isFinite(Date.parse(a.publishedAt+'T00:00:00Z'))||!/^## /m.test(a.content))throw Error('ARTICLE_METADATA_INVALID');
 marked.walkTokens(marked.lexer(a.content),token=>{
  if(token.type==='html'||(token.type==='link'||token.type==='image')&&/^(?:javascript|data):/i.test(token.href))throw Error('ARTICLE_UNSAFE_CONTENT');
 });
 if(new Date(a.publishedAt+'T00:00:00Z').toISOString().slice(0,10)!==a.publishedAt||!/[a-zA-Z0-9]/.test(a.category))throw Error('ARTICLE_METADATA_INVALID');
 return a;
}
export function renderMarkdown(content){
 const renderer=new marked.Renderer();
 renderer.code=({text,lang})=>'<pre><code class="hljs">'+(lang&&hljs.getLanguage(lang)?hljs.highlight(text,{language:lang}).value:esc(text))+'</code></pre>';
 return sanitizeHtml(marked.parse(content,{async:false,renderer}),{allowedTags:[...sanitizeHtml.defaults.allowedTags,'img'],allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,span:['class'],code:['class'],a:['href','title','rel'],img:['src','alt','width','height']},allowedSchemes:['https','http']});
}
export function buildSite(root,options={}){
 root=resolve(root);
 const config=JSON.parse(readFileSync(join(root,'site.json'),'utf8'));
 if(config.generator!=='removephotobg-static-v1'||!['developer','engineering'].includes(config.theme))throw Error('SITE_CONFIG_INVALID');
 if(typeof config.title!=='string'||config.title.length>120||typeof config.description!=='string'||config.description.length>350)throw Error('SITE_CONFIG_INVALID');
 const configured=options.previewUrl??options.siteUrl??process.env.SITE_URL??process.env.CI_PAGES_URL??config.siteUrl;
 if(!configured)throw Error('VERIFIED_SITE_URL_REQUIRED');
 const base=new URL(configured.endsWith('/')?configured:configured+'/');
 if(base.username||base.password||base.search||base.hash||!(base.protocol==='https:'||options.previewUrl&&base.protocol==='http:'&&base.hostname==='127.0.0.1'))throw Error('SITE_URL_INVALID');
 const output=resolve(root,'public'),kit=join(root,'builder'),articles=readdirSync(join(root,'content/articles')).filter(f=>f.endsWith('.json')).map(f=>validateArticle(JSON.parse(readFileSync(join(root,'content/articles',f),'utf8')))).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||a.slug.localeCompare(b.slug));
 if(!articles.length||new Set(articles.map(a=>a.slug)).size!==articles.length)throw Error('UNIQUE_ARTICLES_REQUIRED');
 mkdirSync(join(output,'assets'),{recursive:true});
 for(const name of ['style.css','search.js','mark.svg'])copyFileSync(join(kit,name),join(output,'assets',name));
 if(existsSync(join(root,'assets/social.png')))copyFileSync(join(root,'assets/social.png'),join(output,'assets/social.png'));
 const urls=[],canonical=p=>new URL(p,base).href;
 const links=articles.map(a=>({title:a.title,url:canonical('guides/'+a.slug+'/'),description:a.description,tags:a.tags,category:a.category}));
 const cards=list=>'<div class="cards">'+list.map(a=>'<article class="card" data-search="'+esc((a.title+' '+a.description+' '+a.tags.join(' ')+' '+a.category).toLowerCase())+'"><span class="eyebrow">'+esc(a.category)+'</span><h2><a href="'+canonical('guides/'+a.slug+'/')+'">'+esc(a.title)+'</a></h2><p>'+esc(a.description)+'</p><div class="tags">'+a.tags.map(t=>'<a href="'+canonical('tags/'+t+'/')+'">'+esc(t)+'</a>').join('')+'</div><a class="read" href="'+canonical('guides/'+a.slug+'/')+'">Read the guide <span aria-hidden="true">→</span></a></article>').join('')+'</div>';
 const template=readFileSync(join(kit,'layout.html'),'utf8');
 function page(path,title,description,body,article){
  const url=canonical(path),breadcrumb=article?'<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="'+base.href+'">Home</a><span>/</span><a href="'+canonical('guides/')+'">Guides</a><span>/</span><span aria-current="page">'+esc(article.title)+'</span></nav>':'';
  const structured=article?{'@context':'https://schema.org','@type':'TechArticle',headline:article.title,description:article.description,datePublished:article.publishedAt,dateModified:article.publishedAt,mainEntityOfPage:url,author:{'@type':'Organization',name:'RemovePhotoBG'},publisher:{'@type':'Organization',name:'RemovePhotoBG'},articleSection:article.category}:null;
  const fields={title:esc(title===config.title?title:title+' · '+config.title),ogTitle:esc(article?.title??title),description:esc(description),siteTitle:esc(config.title),siteDescription:esc(config.description),base:base.href,canonical:url,body:breadcrumb+body,theme:config.theme,robots:options.previewUrl?'noindex, nofollow':'index, follow',ogType:article?'article':'website',structured:structured?'<script type="application/ld+json">'+JSON.stringify(structured).replaceAll('<','\\u003c')+'</script>':''};
  const html=template.replace(/\{\{([a-zA-Z]+)\}\}/g,(_,key)=>fields[key]??'');
  const dir=join(output,path);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'index.html'),html);urls.push(url);
 }
 page('',config.title,config.description,'<section class="hero"><p class="eyebrow">THE REMOVEPHOTOBG '+(config.theme==='developer'?'DEVELOPER LIBRARY':'ENGINEERING NOTEBOOK')+'</p><h1>'+esc(config.theme==='developer'?'Build better image workflows.':'Design the system behind the image.')+'</h1><p class="lead">'+esc(config.description)+'</p><a class="primary" href="'+canonical('guides/')+'">Explore the guides <span aria-hidden="true">↗</span></a><div class="hero-meta"><span>Practical code</span><span>Clear tradeoffs</span><span>Independent checks</span></div></section><section class="section"><div class="section-head"><div><p class="eyebrow">START READING</p><h2>Notes worth keeping open</h2></div><p>Specific tasks. Tested examples. No invented benchmarks.</p></div>'+cards(articles)+'</section><section class="callout"><h2>A useful resource, with a clear scope.</h2><p>These guides explain general image engineering. They do not document a public RemovePhotoBG API or promise a particular service capability.</p><a href="'+canonical('about/')+'">About this library →</a></section>');
 page('guides/','All guides','Browse practical image engineering guides, categories and reproducible examples.','<header class="page-head"><p class="eyebrow">THE LIBRARY</p><h1>All guides</h1><p>Search titles, descriptions, categories and tags.</p></header><p id="search-status" role="status"></p>'+cards(articles));
 page('about/','About','The purpose, editorial standards and scope of this RemovePhotoBG technical library.','<div class="prose"><h1>About this library</h1><p>'+esc(config.description)+'</p><h2>Editorial approach</h2><p>Each guide describes a concrete task, its limits and ways to verify the result. Example limits are application choices, not universal recommendations. Source links point to primary documentation when technical behavior matters.</p><h2>Scope and product references</h2><p><a href="https://removephotobg.com/">RemovePhotoBG</a> is referenced where preparing a background-free image is relevant. These pages do not claim an official public product API, guarantee indexing or promise ranking gains.</p><h2>Corrections</h2><p>Keep source code and sample fixtures together. Verify any example against the runtime and requirements of your own application before using it in production.</p></div>');
 for(const a of articles){
  page('guides/'+a.slug+'/',a.title,a.description,'<header class="article-head"><p class="eyebrow">'+esc(a.category)+'</p><h1>'+esc(a.title)+'</h1><p class="lead">'+esc(a.description)+'</p><div class="article-meta"><span>RemovePhotoBG</span><time datetime="'+a.publishedAt+'">'+a.publishedAt+'</time><span>'+Math.max(1,Math.ceil(a.content.split(/\s+/).length/200))+' min read</span></div></header><article class="prose">'+renderMarkdown(a.content)+'</article><aside class="related"><h2>Continue exploring</h2>'+cards(articles.filter(x=>x.slug!==a.slug).slice(0,2))+'</aside>',a);
 }
 for(const type of ['categories','tags']){
  const values=[...new Set(articles.flatMap(a=>type==='tags'?a.tags:[a.category]))];
  const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  page(type+'/',type==='tags'?'Tags':'Categories','Browse guides by '+type+'.','<header class="page-head"><h1>'+esc(type==='tags'?'Tags':'Categories')+'</h1></header><div class="taxonomy">'+values.map(v=>'<a href="'+canonical(type+'/'+slug(v)+'/')+'">'+esc(v)+'</a>').join('')+'</div>');
  for(const v of values)page(type+'/'+slug(v)+'/',v,'Guides about '+v+'.','<header class="page-head"><p class="eyebrow">'+type.toUpperCase()+'</p><h1>'+esc(v)+'</h1></header>'+cards(articles.filter(a=>type==='tags'?a.tags.includes(v):a.category===v)));
 }
 writeFileSync(join(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>'<url><loc>'+esc(url)+'</loc></url>').join('')+'</urlset>');
 writeFileSync(join(output,'robots.txt'),'User-agent: *\n'+(options.previewUrl?'Disallow: /\n':'Allow: /\n')+'Sitemap: '+canonical('sitemap.xml')+'\n');
 writeFileSync(join(output,'rss.xml'),'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>'+esc(config.title)+'</title><link>'+esc(base.href)+'</link><description>'+esc(config.description)+'</description>'+articles.map(a=>'<item><title>'+esc(a.title)+'</title><link>'+esc(canonical('guides/'+a.slug+'/'))+'</link><guid isPermaLink="true">'+esc(canonical('guides/'+a.slug+'/'))+'</guid><description>'+esc(a.description)+'</description><pubDate>'+new Date(a.publishedAt+'T00:00:00Z').toUTCString()+'</pubDate></item>').join('')+'</channel></rss>');
 writeFileSync(join(output,'search.json'),JSON.stringify(links));
 writeFileSync(join(output,'deployment.json'),JSON.stringify({generator:config.generator,siteUrl:base.href,commit:process.env.GITHUB_SHA??process.env.CI_COMMIT_SHA??null,builtAt:new Date().toISOString(),articles:articles.map(a=>({slug:a.slug,hash:articleHash(a)}))}));
 writeFileSync(join(output,'.nojekyll'),'');
 return {root,output,base:base.href,urls,articles};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(process.argv[2]??'.'),index=process.argv.indexOf('--preview-url');
 const result=buildSite(root,index>=0?{previewUrl:process.argv[index+1]}:{});
 process.stdout.write(JSON.stringify({built:true,articles:result.articles.length,pages:result.urls.length,siteUrl:result.base})+'\n');
}
