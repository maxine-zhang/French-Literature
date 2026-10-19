import {get,put} from '@vercel/blob';
import {createHash} from 'node:crypto';
export function cloudConfigured(){return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN)}
export async function readCloud<T=any>(pathname:string,maxBytes=24000000):Promise<{value:T;etag:string}|null>{
 try{const r=await get(pathname,{access:'private',useCache:false});if(!r||r.statusCode!==200)return null;if(r.blob.size>maxBytes)throw Error('云端文件过大。');return {value:await new Response(r.stream).json(),etag:r.blob.etag}}catch(e){if((e as Error).name==='BlobNotFoundError')return null;throw e}
}
export async function writeCloud(pathname:string,value:unknown,options:{etag?:string;overwrite?:boolean}={}){return put(pathname,JSON.stringify(value),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:options.overwrite??true,cacheControlMaxAge:60,...(options.etag?{ifMatch:options.etag}:{})})}
export function translationPath(text:string,lang:string){return `translation-cache/v1/${createHash('sha256').update(JSON.stringify([lang==='en'?'en':'zh',text])).digest('hex')}.json`}
