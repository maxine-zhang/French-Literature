import {get,list,head} from '@vercel/blob';
import {requireAccess} from '../../lib/access';
import {cloudConfigured,readCloud,writeCloud} from '../../lib/cloud';
import {parseBook,validBookId} from '../../lib/book';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store'};
function access(req:Request){return requireAccess(req)||(!cloudConfigured()?Response.json({error:'云端书库尚未连接。'},{status:503}):null)}
export async function GET(req:Request){const denied=access(req);if(denied)return denied;
 try{const params=new URL(req.url).searchParams,id=params.get('id');
 if(id){if(!validBookId(id))return Response.json({error:'书籍编号无效。'},{status:400});
 if(params.get('original')==='1'){const file=await get(`library/${id}/original.epub`,{access:'private',useCache:false});if(!file||file.statusCode!==200)return Response.json({error:'此书没有云端原始 EPUB。'},{status:404});return new Response(file.stream,{headers:{...headers,'Content-Type':'application/epub+zip','Content-Disposition':'attachment; filename="book.epub"','X-Content-Type-Options':'nosniff'}})}
 const saved=await readCloud(`library/${id}/book.json`);if(!saved)return Response.json({error:'云端未找到此书。'},{status:404});
 const translations=await readCloud(`library-translations/${id}.json`,16000000);
 return Response.json({book:parseBook(saved.value),translations:translations?.value||{}},{headers});}
 const cursor=params.get('cursor')||undefined,result=await list({prefix:'library-index/',limit:100,cursor});
 const books=[];for(let i=0;i<result.blobs.length;i+=8){const batch=await Promise.all(result.blobs.slice(i,i+8).map(async item=>(await readCloud(item.pathname,10000))?.value));books.push(...batch.filter(Boolean))}
 return Response.json({books,cursor:result.hasMore?result.cursor:null},{headers});
 }catch{return Response.json({error:'云端书库读取失败，请重试。'},{status:502})}}
export async function POST(req:Request){const denied=access(req);if(denied)return denied;
 try{const {id}=await req.json();if(!validBookId(id))return Response.json({error:'书籍编号无效。'},{status:400});const saved=await readCloud(`library/${id}/book.json`);if(!saved)throw Error();const book=parseBook(saved.value);let original=false;try{await head(`library/${id}/original.epub`);original=true}catch{}
 const record={id:book.id,title:book.title,author:book.author,chapters:book.chapters.length,original,updatedAt:Date.now()};await writeCloud(`library-index/${id}.json`,record);return Response.json(record,{headers})
 }catch{return Response.json({error:'书籍云端登记失败，浏览器中的副本仍保留。'},{status:502})}}
export async function PATCH(req:Request){const denied=access(req);if(denied)return denied;
 try{if(Number(req.headers.get('content-length'))>1500000)return Response.json({error:'译文批次过大。'},{status:413});const body=await req.json(),{id,translations}=body;if(!validBookId(id)||!translations||typeof translations!=='object'||Array.isArray(translations)||Object.keys(translations).length>30)return Response.json({error:'译文格式无效。'},{status:400});
 const entries=Object.entries(translations);for(const [key,value]of entries)if(!key.startsWith(`${id}:`)||!new RegExp(`^${id}:\\d+:\\d+:(zh|en)(:s1:\\d+)?$`).test(key)||typeof value!=='string'||value.length>100000||!value.trim())return Response.json({error:'译文内容无效。'},{status:400});
 const exists=await readCloud(`library-index/${id}.json`,10000);if(!exists)return Response.json({error:'请先保存书籍。'},{status:409});
 for(let attempt=0;attempt<3;attempt++){const current=await readCloud<Record<string,string>>(`library-translations/${id}.json`,16000000);try{await writeCloud(`library-translations/${id}.json`,{...current?.value,...translations},{etag:current?.etag,overwrite:Boolean(current)});return Response.json({saved:entries.map(([k])=>k)},{headers})}catch(e){if(attempt===2)throw e}}
 throw Error();
 }catch{return Response.json({error:'译文云端保存失败；本地译文保留，可重试同步。'},{status:502})}}
