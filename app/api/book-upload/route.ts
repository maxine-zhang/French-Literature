import {handleUploadPresigned,type HandleUploadPresignedBody} from '@vercel/blob/client';
import {issueSignedToken} from '@vercel/blob';
import {requireAccess} from '../../lib/access';
import {cloudConfigured} from '../../lib/cloud';
export async function POST(req:Request){
 const denied=requireAccess(req);if(denied)return denied;
 if(!cloudConfigured())return Response.json({error:'云端书库尚未连接。'},{status:503});
 try{const body=await req.json() as HandleUploadPresignedBody;
 const result=await handleUploadPresigned({body,request:req,getSignedToken:async(pathname)=>{
 if(!/^library\/[a-zA-Z0-9_-]{1,80}\/(book\.json|original\.epub)$/.test(pathname))throw Error('无效书籍路径');
 const json=pathname.endsWith('book.json'),maximumSizeInBytes=json?24000000:40*1024*1024,allowedContentTypes=json?['application/json']:['application/epub+zip'];
 const token=await issueSignedToken({pathname,operations:['put'],validUntil:Date.now()+15*60*1000,maximumSizeInBytes,allowedContentTypes});
 return {token,urlOptions:{allowOverwrite:true,addRandomSuffix:false,cacheControlMaxAge:60,maximumSizeInBytes,allowedContentTypes}};
 }});return Response.json(result,{headers:{'Cache-Control':'private, no-store'}})
 }catch{return Response.json({error:'无法准备私有上传，请重试或检查云存储连接。'},{status:400})}
}
