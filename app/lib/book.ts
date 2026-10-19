export type Chapter={title:string;paragraphs:string[]};
export type Book={id:string;title:string;author:string;chapters:Chapter[];chapter:number;position:number;mode:string;cover?:string};
export function validBookId(id:unknown):id is string{return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id)}
export function parseBook(value:unknown):Book{
 const b=value as Book;
 if(!b||!validBookId(b.id)||typeof b.title!=='string'||b.title.length>500||typeof b.author!=='string'||b.author.length>500||!Array.isArray(b.chapters)||!b.chapters.length||b.chapters.length>5000)throw Error('书籍格式无效。');
 let size=0,count=0;
 const chapters=b.chapters.map(c=>{if(!c||typeof c.title!=='string'||c.title.length>2000||!Array.isArray(c.paragraphs)||!c.paragraphs.length)throw Error('书籍目录无效。');for(const p of c.paragraphs){if(typeof p!=='string'||p.length>1000000)throw Error('书籍段落无效。');size+=p.length;if(++count>100000||size>20000000)throw Error('书籍正文过大。')}return {title:c.title,paragraphs:c.paragraphs}});
 if(b.cover!==undefined&&(typeof b.cover!=='string'||b.cover.length>3000000||!/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(b.cover)))throw Error('封面格式无效。');
 return {cover:b.cover,id:b.id,title:b.title,author:b.author,chapters,chapter:0,position:0,mode:'zh'};
}
