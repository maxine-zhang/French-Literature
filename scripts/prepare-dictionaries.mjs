// Pinned open dictionaries are built as separate, licensed static resources.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {XMLParser} from 'fast-xml-parser';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'public/dictionaries'),scratch=path.join(root,'.dictionary-sources');
const sources=[
 ['fra-zho','2025.11.23','3a101af1bdd523e29f217dd8612ade44dbc73b65b4ea1358ac778ebe155a2cd8b02e3816cb1a9f1dd6500937fa35825d1544db57c5a8aedf71a365c57cdf188a','fr','zh','法中词典','CC BY-SA 3.0'],
 ['fra-eng','0.4.1','bf234cfc9aedea3e322ee9bc518f6b1addfcc4a96c6b9c42d2bd1de765ae2011b057888134c9c4361422d4632e289455c92c6c429fcfab566a95cdc49ac2a2fb','fr','en','法英词典','GPL-2.0-or-later'],
 ['eng-fra','0.1.6','7b7decb42f36617958303b8640616acc06e82aecd955e78949b67e083a7dbbdc4c668fee9cfcda20f219897767f64daabc942b3c3c01ed1f5e8d6ee56262e8a7','en','fr','英法词典','GPL-2.0-or-later']
];
const revision='freedict-lefff-v1';
try{const existing=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));if(existing.revision===revision){console.log('Dictionary assets already prepared.');process.exit(0)}}catch{}
await mkdir(scratch,{recursive:true});await mkdir(out,{recursive:true});
async function download(url,file,hash,algorithm='sha512'){
 const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error(`Dictionary download failed: ${response.status} ${url}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(createHash(algorithm).update(bytes).digest('hex')!==hash)throw Error('Dictionary checksum mismatch');await writeFile(file,bytes);
}
const array=v=>v==null?[]:Array.isArray(v)?v:[v];
const text=v=>typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(text).join(' '):v&&typeof v==='object'?Object.entries(v).filter(([k])=>!k.startsWith('@_')).map(([,v])=>text(v)).join(' '):'';
const clean=v=>text(v).replace(/\s+/g,' ').trim();
const norm=s=>s.normalize('NFC').toLocaleLowerCase('fr').replace(/’/g,"'").trim();
const bucket=s=>/^[a-z]/.test(s)?s[0]:'_';
const parser=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:true});
const dictionaries=[];
for(const [id,version,checksum,sourceLang,targetLang,name,license] of sources){
 const archive=path.join(scratch,`${id}.tar.xz`);await download(`https://download.freedict.org/dictionaries/${id}/${version}/freedict-${id}-${version}.src.tar.xz`,archive,checksum);
 execFileSync('tar',['-xJf',archive,'-C',scratch]);
 const dir=path.join(out,id);await mkdir(dir,{recursive:true});
 const source=await readFile(path.join(scratch,id,`${id}.tei`),'utf8');
 const parsed=parser.parse(source).TEI;const shards={};let count=0;
 for(const e of array(parsed.text.body.entry)){
  const forms=array(e.form),orth=forms.flatMap(f=>array(f.orth)).map(clean).filter(Boolean);
  const quotes=[];const positions=[],genders=[];
  function visit(v){if(!v||typeof v!=='object')return;for(const [k,value]of Object.entries(v)){if(k==='cit')for(const c of array(value)){if(c['@_type']==='trans')quotes.push(...array(c.quote).map(clean))}if(k==='pos')positions.push(...array(value).map(clean));if(k==='gen')genders.push(...array(value).map(clean));visit(value)}}visit(e);
  const meaning=[...new Set(quotes.filter(Boolean))].join('; ');if(!meaning)continue;
  for(const word of orth){const key=norm(word),b=bucket(key);shards[b]??=Object.create(null);shards[b][key]??=[];shards[b][key].push({word,meaning,pos:[...new Set(positions)].join(' / '),gender:[...new Set(genders)].join(' / '),ipa:clean(forms[0]?.pron)});count++}
 }
 for(const [b,entries]of Object.entries(shards))await writeFile(path.join(dir,`${b}.json`),JSON.stringify(entries));
 await copyFile(path.join(scratch,id,'COPYING'),path.join(dir,'LICENSE.txt'));await writeFile(path.join(dir,`${id}.tei`),source);await writeFile(path.join(dir,'SOURCE.txt'),clean(parsed.teiHeader));
 dictionaries.push({id,name,sourceLang,targetLang,count,version,license,source:id==='fra-zho'?'FreeDict / WikDict':'FreeDict',url:'https://freedict.org/downloads/'});
 console.log(`${name}: ${count} entries`);
}
const archive=path.join(scratch,'lefff.tgz');await download('https://registry.npmjs.org/french-verbs-lefff/-/french-verbs-lefff-3.4.0.tgz',archive,'5e45e68a1b7689af35f34093c681f5b586a64509','sha1');execFileSync('tar',['-xzf',archive,'-C',scratch]);
const forms=Object.create(null),conjugations=JSON.parse(await readFile(path.join(scratch,'package/dist/conjugations.json'),'utf8'));
for(const [lemma,tenses]of Object.entries(conjugations))for(const values of Object.values(tenses))for(const form of values){if(!form||form==='NA')continue;const key=norm(form),b=bucket(key);forms[b]??=Object.create(null);forms[b][key]??=new Set();forms[b][key].add(norm(lemma))}
const dir=path.join(out,'forms');await mkdir(dir,{recursive:true});
for(const [b,entries]of Object.entries(forms))await writeFile(path.join(dir,`${b}.json`),JSON.stringify(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,[...v].sort()]))));
await copyFile(path.join(scratch,'package/dist/LICENSE'),path.join(dir,'LICENSE.txt'));await copyFile(path.join(scratch,'package/dist/conjugations.json'),path.join(dir,'conjugations.json'));await copyFile(path.join(scratch,'package/README.md'),path.join(dir,'SOURCE.md'));
await writeFile(path.join(out,'manifest.json'),JSON.stringify({revision,version:revision,dictionaries},null,2));await rm(scratch,{recursive:true,force:true});
