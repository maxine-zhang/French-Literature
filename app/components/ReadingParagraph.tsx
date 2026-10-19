'use client';
import {Volume2} from 'lucide-react';
import FrenchText from './FrenchText';
import {readingSegments,alignedTranslation,segmentKey} from '../lib/readingSegments';
export default function ReadingParagraph({text,base,mode,translations,hidden,placeholder,onSelect,onSpeak,onSave,onTranslate}:{text:string;base:string;mode:string;translations:Record<string,string>;hidden:boolean;placeholder:string;onSelect:(word:string)=>void;onSpeak:(text:string)=>void;onSave:(term:string,meaning:string)=>void;onTranslate:(text:string)=>void}){
 const parts=readingSegments(text),legacy=translations[base],aligned=legacy?alignedTranslation(text,legacy,mode):null;
 return <>{parts.map((part,index)=>{const translation=translations[parts.length===1?base:segmentKey(base,index)]||aligned?.[index];return <section className="reading-segment" key={index}>{parts.length>1&&<span className="segment-label">片段 {index+1} / {parts.length}</span>}<p lang="fr" style={{filter:hidden?'blur(7px)':undefined}}><FrenchText text={part} onSelect={onSelect} onSpeak={onSpeak} onSave={onSave}/></p><div className="paragraph-actions"><button title="播放这段" onClick={()=>onSpeak(part)}><Volume2 size={15}/></button><button onClick={()=>onTranslate(part)}>译</button></div>{mode!=='fr'&&<div className="translation">{translation||<span>{placeholder}</span>}</div>}</section>})}{parts.length>1&&mode!=='fr'&&legacy&&!aligned&&<details className="original-translation"><summary>查看已保存的整段译文</summary><div className="translation">{legacy}</div></details>}</>;
}
