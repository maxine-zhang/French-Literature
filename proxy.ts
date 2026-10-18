import {NextRequest,NextResponse} from 'next/server';
export function proxy(request:NextRequest){
 const password=process.env.APP_PASSWORD;
 if(!password)return NextResponse.next();
 const auth=request.headers.get('authorization');
 if(auth?.startsWith('Basic ')){
  try{const value=atob(auth.slice(6));if(value.slice(value.indexOf(':')+1)===password)return NextResponse.next()}catch{}
 }
 return new NextResponse('请输入你设置的访问密码。',{status:401,headers:{'WWW-Authenticate':'Basic realm="Liseuse", charset="UTF-8"','Cache-Control':'no-store'}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
