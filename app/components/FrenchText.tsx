'use client';
import {useEffect, useId, useRef, useState} from 'react';
import SafeMarkdown from './SafeMarkdown';
import {formatMatch,lookupLocal,Match} from '../lib/dictionary';
const aiCache = new Map<string,string>();
type Popup={word:string;matches:Match[];warning:string;loading:boolean;ai:string;aiBusy:boolean;aiError:boolean;left:number;top:number};
export default function FrenchText({text,onSelect,onSpeak,onSave}:{text:string;onSelect:(word:string)=>void;onSpeak:(word:string)=>void;onSave:(word:string,meaning:string)=>void}){
 const id=useId(),[popup,setPopup]=useState<Popup|null>(null),[language,setLanguage]=useState('all');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),request=useRef<AbortController|null>(null),generation=useRef(0);
 function close(){if(timer.current)clearTimeout(timer.current);request.current?.abort();generation.current++;setPopup(null)}
 useEffect(()=>{const hide=(event:Event)=>{if(event.type==='scroll'&&event.target instanceof Element&&event.target.closest('.word-popup'))return;close()};window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);return()=>{window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);close()}},[text]);
 function lookup(word:string,element:HTMLElement){close();const version=generation.current,rect=element.getBoundingClientRect();const position={left:Math.max(12,Math.min(rect.left,window.innerWidth-372)),top:rect.bottom+8>window.innerHeight-330?Math.max(12,rect.top-330):rect.bottom+8};timer.current=setTimeout(async()=>{
  setLanguage('all');setPopup({word,matches:[],warning:'',loading:true,ai:'',aiBusy:false,aiError:false,...position});
  try{const result=await lookupLocal(word);if(version!==generation.current)return;setPopup(p=>p?{...p,...result,loading:false}:p)}catch{if(version===generation.current)setPopup(p=>p?{...p,loading:false,warning:'词库加载失败，请联网重试。'}:p)}
 },250)}
 async function explain(){if(!popup)return;const version=generation.current,word=popup.word,key=JSON.stringify([word,text]);if(aiCache.has(key)){setPopup(p=>p?{...p,ai:aiCache.get(key)!,aiError:false}:p);return}const controller=new AbortController();request.current=controller;setPopup(p=>p?{...p,aiBusy:true,aiError:false,ai:''}:p);
  try{const response=await fetch('/api/study',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'word',text:word,context:text.slice(0,5000)})}),data=await response.json();if(!response.ok||!data.text)throw Error(data.error||'AI 解释失败，请重试。');if(controller.signal.aborted||version!==generation.current)return;if(aiCache.size>=500)aiCache.delete(aiCache.keys().next().value!);aiCache.set(key,data.text);setPopup(p=>p?{...p,ai:data.text,aiBusy:false}:p)}catch(error){if(!controller.signal.aborted&&version===generation.current)setPopup(p=>p?{...p,aiBusy:false,aiError:true,ai:error instanceof Error?error.message:'AI 解释失败。'}:p)}
 }
 const tokens=text.split(/([\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*)/u),visible=popup?.matches.filter(m=>language==='all'||m.targetLang===language)||[];
 return <span className="french-text" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))close()}} onMouseLeave={()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(close,350)}} onKeyDown={e=>{if(e.key==='Escape')close()}}>
 {tokens.map((word,index)=>index%2?<span key={index} className="word-token" tabIndex={0} role="button" aria-label={`查询 ${word}`} aria-describedby={popup?.word===word?id:undefined} onMouseEnter={e=>lookup(word,e.currentTarget)} onFocus={e=>lookup(word,e.currentTarget)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(word);lookup(word,e.currentTarget)}}} onClick={e=>{onSelect(word);lookup(word,e.currentTarget)}}>{word}</span>:word)}
 {popup&&<span id={id} role="dialog" aria-label={`${popup.word} 的释义`} className="word-popup" style={{left:popup.left,top:popup.top}} onScroll={e=>e.stopPropagation()} onMouseEnter={()=>{if(timer.current)clearTimeout(timer.current)}} onClick={e=>e.stopPropagation()}>
 <strong lang="fr">{popup.word}</strong><button className="popup-close" aria-label="关闭释义" onClick={close}>×</button><span className="dictionary-badge">本地词典 · 不调用 AI</span><select aria-label="释义语言" value={language} onChange={e=>setLanguage(e.target.value)}><option value="all">中文优先 · 全部词典</option><option value="zh">中文释义</option><option value="en">English definitions</option></select>
 <span role="status">{popup.loading?'正在加载本地词库…':!visible.length?'本地词库暂未收录；可切换语言或点击 AI 解释本句。':''}{popup.warning&&<span className="lookup-error">{popup.warning}</span>}</span>
 {visible.map((m,i)=><span className="dictionary-entry" key={i}><b lang="fr">{m.word}</b>{m.word.toLowerCase()!==popup.word.toLowerCase()&&<small>{m.inferred?'可能的原形':'词形对应原形'}</small>}<span>{[m.ipa&&`/${m.ipa}/`,m.pos,m.gender].filter(Boolean).join(' · ')}</span><span>{m.meaning}</span><small>{m.dictionary} · {m.license}</small><button onClick={()=>onSave(popup.word,formatMatch(m))}>收藏此义项</button></span>)}
 <span className="popup-actions"><button onClick={()=>onSpeak(popup.word)}>听发音</button><button disabled={popup.aiBusy} onClick={explain}>{popup.aiBusy?'AI 解释中…':'AI 解释本句'}</button></span><small>AI 解释会发送当前词和段落，可能产生费用。</small>
 {popup.ai&&<span className={`dictionary-ai ${popup.aiError?'lookup-error':''}`} role="status"><b>AI 上下文解释</b><SafeMarkdown text={popup.ai}/>{!popup.aiError&&<button onClick={()=>onSave(popup.word,popup.ai)}>收藏 AI 释义</button>}</span>}
 </span>}</span>;
}
