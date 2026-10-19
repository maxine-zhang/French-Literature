'use client';
import {useEffect,useRef,useState} from 'react';
import {uploadPresigned} from '@vercel/blob/client';
import {Book,parseBook} from './book';
type RecordInfo={id:string;title:string;author:string;original:boolean};
export function useCloudLibrary(books:Book[],ready:boolean,translations:Record<string,string>,onBooks:(books:Book[])=>void,onTranslations:(values:Record<string,string>)=>void){
 function pendingFile(id:string,value?:File|null):Promise<File|undefined>{return new Promise((resolve,reject)=>{const open=indexedDB.open('liseuse-upload-queue',1);open.onupgradeneeded=()=>open.result.createObjectStore('files');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('files',value===undefined?'readonly':'readwrite'),store=tx.objectStore('files');let result:File|undefined;if(value===undefined){const read=store.get(id);read.onsuccess=()=>{result=read.result}}else if(value===null)store.delete(id);else store.put(value,id);tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)}}})}
 const [status,setStatus]=useState('正在检查云端书库…'),[hydrated,setHydrated]=useState(false),[available,setAvailable]=useState(false),[records,setRecords]=useState<Record<string,RecordInfo>>({}),[retry,setRetry]=useState(0),[syncing,setSyncing]=useState(false);
 const latest=useRef({books,translations,onBooks,onTranslations});latest.current={books,translations,onBooks,onTranslations};
 const failed=useRef(new Set<string>()),known=useRef(new Set<string>()),originals=useRef(new Map<string,File>()),confirmed=useRef<Record<string,string>>({}),working=useRef(false),translationBusy=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 async function response(r:Response){const value=await r.json();if(!r.ok)throw Error(value.error||'云端同步失败。');return value}
 async function saveBook(book:Book){
  const clean=parseBook(book),file=originals.current.get(book.id)||await pendingFile(book.id).catch(()=>undefined);
  await uploadPresigned(`library/${book.id}/book.json`,new Blob([JSON.stringify(clean)],{type:'application/json'}),{access:'private',handleUploadUrl:'/api/book-upload',contentType:'application/json'});
  if(file)await uploadPresigned(`library/${book.id}/original.epub`,file,{access:'private',handleUploadUrl:'/api/book-upload',contentType:'application/epub+zip',multipart:file.size>4*1024*1024});
  const record=await response(await fetch('/api/books',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:book.id})}));
  known.current.add(book.id);originals.current.delete(book.id);await pendingFile(book.id,null).catch(()=>{});if(alive.current)setRecords(v=>({...v,[book.id]:record}));
 }
 async function flush(){if(translationBusy.current||!alive.current)return;translationBusy.current=true;
  try{const entries=Object.entries(latest.current.translations).filter(([key,value])=>key.split(':')[0]!=='demo'&&known.current.has(key.split(':')[0])&&confirmed.current[key]!==value);
   const groups=new Map<string,[string,string][]>();for(const entry of entries){const id=entry[0].split(':')[0];if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(entry)}
   for(const [id,items]of groups)for(let i=0;i<items.length;i+=10){if(!alive.current)return;const batch=Object.fromEntries(items.slice(i,i+10));await response(await fetch('/api/books',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,translations:batch})}));Object.assign(confirmed.current,batch)}
   if(entries.length&&alive.current)setStatus('书籍与已生成译文已保存到私有云端。');return true;
  }catch(e){if(alive.current)setStatus(e instanceof Error?e.message:'译文云端同步失败，稍后自动重试。');return false;}finally{translationBusy.current=false}
 }
 useEffect(()=>{if(!ready)return;let cancelled=false;setHydrated(false);
  (async()=>{try{const all:RecordInfo[]=[];let cursor:string|null=null;do{const r=await fetch(`/api/books${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);if(r.status===503){if(!cancelled){setAvailable(false);setStatus('云端书库尚未连接，书籍仍在本机保存。')}return}const page=await response(r);all.push(...page.books);cursor=page.cursor;}while(cursor&&!cancelled);
   if(cancelled)return;setAvailable(true);setRecords(Object.fromEntries(all.map(r=>[r.id,r])));known.current=new Set(all.map(r=>r.id));
   // Restore cloud translations before starting automatic AI translation.
   const additions:Book[]=[],merged:Record<string,string>={};
   for(const record of all){if(cancelled)return;const data=await response(await fetch(`/api/books?id=${encodeURIComponent(record.id)}`));if(!latest.current.books.some(b=>b.id===record.id))additions.push(parseBook(data.book));if(data.translations&&typeof data.translations==='object')for(const [key,value]of Object.entries(data.translations))if(key.startsWith(record.id+':')&&typeof value==='string'){merged[key]=value;confirmed.current[key]=value}}
   if(cancelled)return;latest.current.onTranslations(merged);if(additions.length)latest.current.onBooks(additions);setStatus('云端书库已连接，已读取保存的译文。');
  }catch(e){if(!cancelled)setStatus(e instanceof Error?e.message:'云端书库连接失败，请重试。')}finally{if(!cancelled)setHydrated(true)}})();return()=>{cancelled=true}
 },[ready,retry]);
 const ids=books.map(b=>b.id).join(',');
 useEffect(()=>{if(!available||!hydrated||working.current||!latest.current.books.some(book=>book.id!=='demo'&&!known.current.has(book.id)&&!failed.current.has(book.id)))return;working.current=true;setSyncing(true);
  (async()=>{try{for(const book of latest.current.books){if(book.id==='demo'||known.current.has(book.id)||failed.current.has(book.id))continue;setStatus(`正在保存《${book.title}》到私有云端…`);try{await saveBook(book)}catch(e){failed.current.add(book.id);throw e}}const saved=await flush();if(saved&&alive.current)setStatus(failed.current.size?'部分书籍尚未同步，请点击重试同步。':'书籍与已生成译文已保存到私有云端。')}catch(e){if(alive.current)setStatus((e instanceof Error?e.message:'书籍云端保存失败。')+' 本机副本仍保留，请点击重试同步。')}finally{working.current=false;if(alive.current)setSyncing(false)}})();
 },[ids,available,hydrated,retry,syncing]);
 useEffect(()=>{if(!available||!hydrated)return;const interval=setInterval(()=>{flush()},8000);return()=>clearInterval(interval)},[available,hydrated]);
 function sync(){failed.current.clear();setRetry(n=>n+1)}
 return {status,hydrated,available,records,syncing,sync,queueOriginal:(id:string,file:File)=>{originals.current.set(id,file);pendingFile(id,file).catch(()=>{if(alive.current)setStatus('原始 EPUB 暂存失败；请保持页面打开，等待云端上传完成。')})}};
}
