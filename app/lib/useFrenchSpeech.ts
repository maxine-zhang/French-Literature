'use client';
import {useEffect,useRef,useState} from 'react';
import {splitText,splitForSpeech} from './text';
export function useFrenchSpeech({engine,speed,voiceName,paragraphs,repeat,onError}:{engine:string;speed:number;voiceName:string;paragraphs:string[];repeat:{current:boolean};onError:(message:string)=>void}){
 const [playing,setPlaying]=useState(-1),[loading,setLoading]=useState(false),[paused,setPaused]=useState(false),[active,setActive]=useState(false);
 const controller=useRef<AbortController|null>(null),audio=useRef<HTMLAudioElement|null>(null),cache=useRef(new Map<string,Blob>()),latestSpeed=useRef(speed),pauseWanted=useRef(false),resumeWaiter=useRef<(()=>void)|null>(null);
 latestSpeed.current=speed;
 function stop(){controller.current?.abort();controller.current=null;audio.current?.pause();audio.current=null;pauseWanted.current=false;resumeWaiter.current?.();resumeWaiter.current=null;if('speechSynthesis'in window)speechSynthesis.cancel();setPlaying(-1);setLoading(false);setPaused(false);setActive(false)}
 useEffect(()=>()=>{controller.current?.abort();audio.current?.pause();resumeWaiter.current?.();if('speechSynthesis'in window)speechSynthesis.cancel()},[]);
 useEffect(()=>{if(audio.current)audio.current.playbackRate=speed},[speed]);
 async function voices(signal:AbortSignal){
  const synth=window.speechSynthesis;let available=synth.getVoices().filter(v=>v.lang.toLowerCase().startsWith('fr'));
  if(!available.length){await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);synth.removeEventListener('voiceschanged',done);signal.removeEventListener('abort',done);resolve()},timer=setTimeout(done,1800);synth.addEventListener('voiceschanged',done);signal.addEventListener('abort',done,{once:true})});available=synth.getVoices().filter(v=>v.lang.toLowerCase().startsWith('fr'))}
  return available.find(v=>v.name===voiceName)||available.find(v=>v.name==='Thomas'&&v.lang.toLowerCase()==='fr-fr')||available.find(v=>v.lang.toLowerCase()==='fr-fr'&&v.localService)||available.find(v=>v.lang.toLowerCase()==='fr-fr')||available[0];
 }
 async function speak(text:string,index=-1,continuous=false){
  stop();if(!text.trim())return;const job=new AbortController();controller.current=job;const signal=job.signal;setActive(true);setLoading(true);
  try{let current=text,position=index;
   do{if(signal.aborted)return;setPlaying(position);
    for(const chunk of engine==='device'?splitForSpeech(current):splitText(current)){
     if(pauseWanted.current)await new Promise<void>(resolve=>{resumeWaiter.current=resolve});if(signal.aborted)return;
     if(engine==='device'){
      if(!('speechSynthesis'in window))throw Error('此浏览器不支持设备朗读，请换用 Safari 或 Chrome。');
      const voice=await voices(signal);if(signal.aborted)return;if(!voice)throw Error('未找到法语声音。请在系统设置的朗读/辅助功能中下载法语声音，再点击试听。');
      await new Promise<void>((resolve,reject)=>{
       const utterance=new SpeechSynthesisUtterance(chunk);utterance.lang=voice.lang;utterance.voice=voice;utterance.rate=latestSpeed.current;
       let settled=false;const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(startTimer);signal.removeEventListener('abort',abort);utterance.onend=null;utterance.onerror=null;utterance.onstart=null;error?reject(error):resolve()};
       const abort=()=>{speechSynthesis.cancel();finish(Error('aborted'))};signal.addEventListener('abort',abort,{once:true});
       const startTimer=setTimeout(()=>{if(!signal.aborted&&!pauseWanted.current){speechSynthesis.cancel();finish(Error('语音没有启动，请点击重试或在偏好设置中换一个法语声音。'))}},12000);
       utterance.onstart=()=>{clearTimeout(startTimer);setLoading(false);if(pauseWanted.current)speechSynthesis.pause()};
       utterance.onend=()=>finish();utterance.onerror=e=>finish(Error(e.error==='not-allowed'?'浏览器需要一次点击才能朗读，请再次点击播放。':'设备朗读中断，请重试或换一个法语声音。'));
       speechSynthesis.speak(utterance);
      });
     }else{
      let blob=cache.current.get(chunk);if(!blob){setLoading(true);const response=await fetch('/api/speech',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chunk})});if(!response.ok){const data=await response.json();throw Error(data.error||'云端朗读失败。')}if(!response.headers.get('content-type')?.startsWith('audio/'))throw Error('语音服务未返回有效音频。');blob=await response.blob();if(signal.aborted)return;if(cache.current.size>=32)cache.current.delete(cache.current.keys().next().value!);cache.current.set(chunk,blob)}
      setLoading(false);const url=URL.createObjectURL(blob),player=new Audio(url);audio.current=player;player.playbackRate=latestSpeed.current;
      try{await new Promise<void>((resolve,reject)=>{let settled=false;const finish=(error?:Error)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);error?reject(error):resolve()},abort=()=>{player.pause();finish(Error('aborted'))};signal.addEventListener('abort',abort,{once:true});player.onended=()=>finish();player.onerror=()=>finish(Error('音频播放失败，请重新播放。'));if(pauseWanted.current){resumeWaiter.current=()=>{player.play().catch(()=>finish(Error('请再次点击播放。')))}}else player.play().catch(()=>finish(Error('浏览器阻止了音频，请再次点击播放。')))})}finally{player.pause();URL.revokeObjectURL(url);if(audio.current===player)audio.current=null}
     }
    }
    if(continuous&&position+1<paragraphs.length){position++;current=paragraphs[position]}else if(!continuous&&repeat.current)continue;else break;
   }while(!signal.aborted)
  }catch(e){if(!signal.aborted)onError(e instanceof Error?e.message:'朗读失败。')}finally{if(controller.current===job){controller.current=null;pauseWanted.current=false;setPlaying(-1);setLoading(false);setPaused(false);setActive(false)}}
 }
 function togglePause(){if(!controller.current)return;const next=!pauseWanted.current;pauseWanted.current=next;setPaused(next);
  if(audio.current){if(next)audio.current.pause();else{const job=controller.current;audio.current.play().catch(()=>{if(controller.current===job)onError('无法继续播放，请重新开始。')})}}
  else if('speechSynthesis'in window){if(next)speechSynthesis.pause();else speechSynthesis.resume()}
  if(!next){resumeWaiter.current?.();resumeWaiter.current=null}
 }
 return {speak,stop,playing,loading,paused,active,togglePause};
}
