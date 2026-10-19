import type {Chapter,TocEntry} from './book';
export type EpubSection={path:string;doc:Document;elements:Element[]};
const local=(el:Element,name:string)=>Array.from(el.children).filter(x=>x.localName===name);
export function resolveEpubLink(href:string,from:string){
 try{const url=new URL(href,`https://epub.local/${from}`);if(url.origin!=='https://epub.local')return null;return {path:decodeURIComponent(url.pathname.slice(1)),fragment:decodeURIComponent(url.hash.slice(1))}}catch{return null}
}
export function extractEpubToc(opf:Document,opfPath:string,files:Record<string,Uint8Array>,sections:EpubSection[],chapters:Chapter[]):TocEntry[]{
 const items=Array.from(opf.getElementsByTagNameNS('*','item'));
 const read=(path:string)=>files[path]?new TextDecoder().decode(files[path]):'';
 function target(href:string,from:string):Pick<TocEntry,'chapter'|'paragraph'>{
  const link=resolveEpubLink(href,from);if(!link)return {};
  const chapter=sections.findIndex(s=>s.path===link.path);if(chapter<0)return {};
  const section=sections[chapter];let paragraph=0;
  if(link.fragment){const anchor=section.doc.getElementById(link.fragment)||Array.from(section.doc.querySelectorAll('[name]')).find(e=>e.getAttribute('name')===link.fragment);if(!anchor)return {};
   const index=section.elements.findIndex(el=>el===anchor||el.contains(anchor)||anchor.contains(el)||Boolean(anchor.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING));if(index<0)return {};paragraph=index;
  }return {chapter,paragraph};
 }
 let toc:TocEntry[]=[];
 const navItem=items.find(i=>(i.getAttribute('properties')||'').split(/\s+/).includes('nav'));
 if(navItem){const path=resolveEpubLink(navItem.getAttribute('href')||'',opfPath)?.path;if(path&&read(path)){const doc=new DOMParser().parseFromString(read(path),'text/html');const nav=Array.from(doc.querySelectorAll('nav')).find(n=>(n.getAttribute('epub:type')||n.getAttribute('type')||'').split(/\s+/).includes('toc')||n.getAttribute('role')==='doc-toc');
  function walk(list:Element,depth:number){for(const li of local(list,'li')){const label=Array.from(li.children).find(el=>el.localName==='a'||el.localName==='span');if(label?.textContent?.trim())toc.push({title:label.textContent.trim(),depth,...(label.localName==='a'?target(label.getAttribute('href')||'',path!):{})});for(const nested of local(li,'ol'))walk(nested,depth+1)}}
  if(nav)for(const list of local(nav,'ol'))walk(list,0);
 }}
 if(!toc.length){const spine=opf.getElementsByTagNameNS('*','spine')[0],ncx=items.find(i=>i.getAttribute('id')===spine?.getAttribute('toc'))||items.find(i=>i.getAttribute('media-type')==='application/x-dtbncx+xml');const path=ncx&&resolveEpubLink(ncx.getAttribute('href')||'',opfPath)?.path;
  if(path&&read(path)){const doc=new DOMParser().parseFromString(read(path),'application/xml');const map=doc.getElementsByTagNameNS('*','navMap')[0];function walk(parent:Element,depth:number){for(const point of local(parent,'navPoint')){const label=local(point,'navLabel')[0]?.textContent?.trim(),href=local(point,'content')[0]?.getAttribute('src');if(label)toc.push({title:label,depth,...(href?target(href,path!):{})});walk(point,depth+1)}}if(map)walk(map,0)}
 }
 // Some EPUBs only supply headings; retain a useful flat chapter list in that case.
 if(!toc.length)toc=chapters.map((c,chapter)=>({title:c.title,depth:0,chapter,paragraph:0}));
 return toc.slice(0,10000).map(entry=>({...entry,title:entry.title.slice(0,2000),depth:Math.min(entry.depth,12)}));
}
export async function recoverEpubToc(bytes:ArrayBuffer,chapters:Chapter[]){
 const {unzipSync,strFromU8}=await import('fflate');
 const files=unzipSync(new Uint8Array(bytes),{filter:entry=>{if(entry.originalSize>20*1024*1024)throw Error('章节资源过大。');return true}});
 const xml=(path:string)=>new DOMParser().parseFromString(strFromU8(files[path]),'application/xml');
 const path=xml('META-INF/container.xml').getElementsByTagNameNS('*','rootfile')[0]?.getAttribute('full-path');if(!path||!files[path])throw Error('原始 EPUB 缺少目录。');const opf=xml(path),items=Array.from(opf.getElementsByTagNameNS('*','item')),sections:EpubSection[]=[];
 for(const ref of Array.from(opf.getElementsByTagNameNS('*','itemref'))){const item=items.find(i=>i.getAttribute('id')===ref.getAttribute('idref')),link=item&&resolveEpubLink(item.getAttribute('href')||'',path);if(!link||!files[link.path])continue;const doc=new DOMParser().parseFromString(strFromU8(files[link.path]),'text/html');doc.querySelectorAll('script,style,nav').forEach(e=>e.remove());const elements=Array.from(doc.querySelectorAll('p,h1,h2,h3,blockquote')).filter(e=>!e.parentElement?.closest('p,blockquote')&&e.textContent?.trim());if(elements.length||doc.body.textContent?.trim())sections.push({path:link.path,doc,elements:elements.length?elements:[doc.body]})}
 // Never move existing paragraph IDs or cached translations while upgrading an older import.
 if(sections.length!==chapters.length||sections.some((s,i)=>s.elements.length!==chapters[i].paragraphs.length||s.elements.some((e,j)=>e.textContent?.trim()!==chapters[i].paragraphs[j])))throw Error('原文件与当前正文不一致，请重新导入此 EPUB。');
 return extractEpubToc(opf,path,files,sections,chapters);
}
