// Stable display chunks leave original EPUB paragraph IDs, bookmarks and TOC anchors intact.
export function sentencePieces(text:string,lang='fr'):string[]{
 return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(lang,{granularity:'sentence'}).segment(text)].map(s=>s.segment):text.match(/[^.!?。！？]+[.!?。！？]*\s*/gu)||[text];
}
export function readingSegments(text:string):string[]{
 if(text.length<=500)return [text];
 const pieces=sentencePieces(text);const result:string[]=[];let current='';
 for(const piece of pieces){if(current&&current.length+piece.length>400){result.push(current);current=''}current+=piece;if(current.length>=400){result.push(current);current=''}}
 if(current)result.push(current);
 // An unusually long sentence is split at a clause boundary, then a word boundary.
 return result.flatMap(part=>{const chunks:string[]=[];let rest=part;while(rest.length>800){const head=rest.slice(0,600);const clause=Math.max(head.lastIndexOf('; '),head.lastIndexOf(' : '),head.lastIndexOf(', '),head.lastIndexOf(' — '));let end=clause>200?clause+1:head.lastIndexOf(' ');if(end<1)end=600;if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;chunks.push(rest.slice(0,end));rest=rest.slice(end)}if(rest)chunks.push(rest);return chunks});
}
export function segmentKey(base:string,index:number){return `${base}:s1:${index}`}
export function alignedTranslation(text:string,translation:string,lang:string):string[]|null{
 const chunks=readingSegments(text);if(chunks.length===1)return [translation];
 const source=sentencePieces(text),target=sentencePieces(translation,lang==='en'?'en':'zh');
 // Only reuse an old translation if sentence boundaries have an exact one-to-one mapping.
 if(source.length!==target.length)return null;
 const result:string[]=[];let offset=0,index=0;
 for(const chunk of chunks){let end=offset+chunk.length,joined='';while(index<source.length&&offset<end){const sentence=source[index];if(offset+sentence.length>end)return null;joined+=target[index];offset+=sentence.length;index++}result.push(joined.trim())}
 return index===source.length?result:null;
}
export function translationEntries(book:{id:string;chapters:{paragraphs:string[]}[]},lang:string,translations:Record<string,string>){
 return book.chapters.flatMap((chapter,ci)=>chapter.paragraphs.flatMap((text,pi)=>{const base=`${book.id}:${ci}:${pi}:${lang}`,parts=readingSegments(text),legacy=translations[base],aligned=legacy?alignedTranslation(text,legacy,lang):null;return parts.map((part,index)=>({key:parts.length===1?base:segmentKey(base,index),text:part,existing:aligned?.[index],chapter:ci,paragraph:pi}))}));
}
