import manifest from '../../public/dictionaries/manifest.json';
export type Entry = {word:string; meaning:string; pos?:string; gender?:string; ipa?:string};
export type DictionaryPack = {id:string; name:string; sourceLang:'fr'|'en'; targetLang:'zh'|'en'|'fr'; source:string; license:string; version:string; entries:Entry[]};
export type Match = Entry & {dictionary:string; targetLang:string; source:string; license:string; inferred:boolean};
export const builtins = manifest.dictionaries;
export const normalize = (word:string) => word.normalize('NFC').trim().toLocaleLowerCase('fr').replace(/’/g,"'");
const bucket = (s:string) => /^[a-z]/.test(s) ? s[0] : '_';
const memory = new Map<string,Promise<any>>();
let custom: DictionaryPack[] = [];
let loaded: Promise<void> | undefined;
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('liseuse-dictionaries',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function loadCustom(){if(!loaded)loaded=(async()=>{const db=await database();try{custom=await new Promise<DictionaryPack[]>((resolve,reject)=>{const r=db.transaction('packs').objectStore('packs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}})().catch(e=>{loaded=undefined;throw e});await loaded;return custom;}
export function parsePack(data:unknown):DictionaryPack{
 const p=data as DictionaryPack;
 if(!p || typeof p!=='object'||!['fr','en'].includes(p.sourceLang)||!['zh','en','fr'].includes(p.targetLang)||!Array.isArray(p.entries)||!p.entries.length||p.entries.length>100000)throw Error('词库需包含 sourceLang、targetLang 和 1–100000 个 entries。');
 for(const field of ['name','source','license'] as const)if(typeof p[field]!=='string'||!p[field].trim()||p[field].length>500)throw Error('请填写词库名称、来源和许可。');
 const entries=p.entries.map(e=>{if(!e||typeof e.word!=='string'||!e.word.trim()||e.word.length>120||typeof e.meaning!=='string'||!e.meaning.trim()||e.meaning.length>6000)throw Error('词条需有有效的 word 和 meaning。');for(const k of ['pos','gender','ipa'] as const)if(e[k]!==undefined&&(typeof e[k]!=='string'||e[k]!.length>200))throw Error('词条附加字段无效。');return {word:e.word,meaning:e.meaning,pos:e.pos,gender:e.gender,ipa:e.ipa};});
 return {id:crypto.randomUUID(),name:p.name,source:p.source,license:p.license,version:typeof p.version==='string'?p.version.slice(0,100):'自定义',sourceLang:p.sourceLang,targetLang:p.targetLang,entries};
}
export async function importPack(data:unknown){await loadCustom();const pack=parsePack(data),db=await database();try{await new Promise<void>((resolve,reject)=>{const t=db.transaction('packs','readwrite');t.objectStore('packs').put(pack,pack.id);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)})}finally{db.close()}custom=[...custom,pack];return pack;}
async function json(path:string){const url=`/dictionaries/${path}`;if(!memory.has(url)){const pending=(async()=>{let cache:Cache|undefined;try{cache=await caches.open(`liseuse-dictionaries-${manifest.version}`);const hit=await cache.match(url);if(hit)return hit.json()}catch{}const response=await fetch(url);if(response.status===404)return {};if(!response.ok)throw Error('词库暂时无法下载，请联网重试。');const data=await response.clone().json();try{await cache?.put(url,response)}catch{}return data;})();memory.set(url,pending);pending.catch(()=>memory.delete(url));}return memory.get(url)!;}
export async function lookupLocal(word:string,language:'fr'|'en'='fr'):Promise<{matches:Match[]; warning:string}>{
 let warning='';try{await loadCustom()}catch{warning='无法读取个人词库。'}
 const key=normalize(word),candidates=new Map<string,boolean>([[key,false]]);
 if(language==='fr'){
  const bare=key.replace(/^(?:[ldjtmcsn]|qu)'/,'');if(bare!==key)candidates.set(bare,false);
  try{const forms=await json(`forms/${bucket(bare)}.json`);for(const lemma of (Object.hasOwn(forms,bare)?forms[bare]:[]))candidates.set(lemma,false)}catch{warning='词形索引未缓存，联网后可重试。'}
  // These are candidates, not a claim about a word's grammatical analysis.
  if(bare.endsWith('s')||bare.endsWith('x'))candidates.set(bare.slice(0,-1),true);
  if(bare.endsWith('aux')){candidates.set(bare.slice(0,-3)+'al',true);candidates.set(bare.slice(0,-1),true)}
  if(bare.endsWith('e'))candidates.set(bare.slice(0,-1),true);
  if(bare.endsWith('es'))candidates.set(bare.slice(0,-2),true);
 }
 const matches:Match[]=[];
 for(const pack of custom.filter(p=>p.sourceLang===language))for(const e of pack.entries)if(candidates.has(normalize(e.word)))matches.push({...e,dictionary:pack.name,targetLang:pack.targetLang,source:pack.source,license:pack.license,inferred:candidates.get(normalize(e.word))!});
 await Promise.all(builtins.filter(p=>p.sourceLang===language).map(async pack=>{
  for(const b of new Set([...candidates.keys()].map(bucket))){try{const shard=await json(`${pack.id}/${b}.json`);for(const [candidate,inferred] of candidates)for(const e of (Object.hasOwn(shard,candidate)?shard[candidate]:[]))matches.push({...e,dictionary:pack.name,targetLang:pack.targetLang,source:pack.source,license:pack.license,inferred});}catch{warning='部分词库未缓存或下载失败；可联网后重试。'}}
 }));
 const seen=new Set<string>();return {matches:matches.filter(e=>{const k=JSON.stringify([e.word,e.dictionary,e.meaning]);if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>Number(a.inferred)-Number(b.inferred)||Number(normalize(b.word)===key)-Number(normalize(a.word)===key)||Number(b.targetLang==='zh')-Number(a.targetLang==='zh')),warning};
}
export function formatMatch(e:Match){return [e.word,e.ipa&&`/${e.ipa}/`,e.pos,e.gender,e.meaning,`〔${e.dictionary}〕`].filter(Boolean).join(' · ')}
