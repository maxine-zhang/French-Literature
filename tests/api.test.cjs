const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
// Compile isolated server modules using the project's pinned TypeScript.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename);
const speech = require('../app/api/speech/route.ts');
const study = require('../app/api/study/route.ts');
const capabilities = require('../app/api/capabilities/route.ts');
const {splitText} = require('../app/lib/text.ts');
const originalFetch = global.fetch;
const keys = ['NODE_ENV','APP_PASSWORD','AI_API_KEY','AI_BASE_URL','TTS_API_KEY','TTS_MODEL','TTS_VOICE'];
let saved;
beforeEach(() => {saved = Object.fromEntries(keys.map(k => [k, process.env[k]])); for(const k of keys) delete process.env[k]; process.env.NODE_ENV = 'production';});
afterEach(() => {global.fetch = originalFetch;for(const k of keys) {if(saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];}});
function request(body, auth = true) {return new Request('http://localhost/api', {method:'POST', headers:{'Content-Type':'application/json', ...(auth?{Authorization:'Basic '+Buffer.from('reader:test-password').toString('base64')}:{})},body:JSON.stringify(body)});}
function configured() {process.env.APP_PASSWORD='test-password';process.env.AI_API_KEY='test-only-not-a-real-key';}

test('both paid endpoints require production access protection',async()=>{
 for(const route of [speech,study]) assert.equal((await route.POST(request({text:'Bonjour'}))).status,503);
 configured();
 for(const route of [speech,study]) assert.equal((await route.POST(request({text:'Bonjour'},false))).status,401);
});
test('speech rejects malformed, empty and oversized inputs before calling provider',async()=>{
 configured();global.fetch=()=>{throw Error('Unexpected provider call')};
 for(const body of [null,{}, {text:''},{text:'x'.repeat(3501)}]) assert.equal((await speech.POST(request(body))).status,400);
 assert.equal((await speech.POST(new Request('http://localhost',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('a:test-password').toString('base64')},body:'{'}))).status,400);
});
test('speech forwards the configured French model and returns private audio',async()=>{
 configured();process.env.TTS_VOICE='cedar';let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/audio/speech');const body=JSON.parse(options.body);assert.equal(body.model,'gpt-4o-mini-tts');assert.equal(body.voice,'cedar');assert.equal(body.input,'Bonjour, Élise.');assert.match(body.instructions,/français de France/);assert.equal(body.response_format,'mp3');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}})};
 const response=await speech.POST(request({text:'Bonjour, Élise.'}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);assert.equal(calls,1);
});
test('compatible text credentials are not sent to a different speech provider',async()=>{
 configured();process.env.AI_BASE_URL='https://another-provider.example/v1';
 assert.equal((await speech.POST(request({text:'Bonjour'}))).status,503);
 const state=await capabilities.GET().json();assert.equal(state.speech,false);assert.equal(state.translation,true);
 process.env.TTS_API_KEY='test-speech-key';assert.equal((await capabilities.GET().json()).speech,true);
});
test('speech reports upstream failures without exposing provider bodies',async()=>{
 configured();global.fetch=async()=>new Response('private upstream detail',{status:429});
 const response=await speech.POST(request({text:'Bonjour'}));assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/private upstream/);
 global.fetch=async()=>Response.json({bad:true});assert.equal((await speech.POST(request({text:'Bonjour'}))).status,502);
});
test('study validates tasks and payloads and rejects empty provider answers',async()=>{
 configured();for(const body of [null,{task:'__proto__',text:'a'},{task:'translate',text:''}]) assert.equal((await study.POST(request(body))).status,400);
 global.fetch=async()=>Response.json({choices:[]});assert.equal((await study.POST(request({task:'translate',text:'Bonjour'}))).status,502);
});
test('hover lookup passes context and requests concise dictionary meanings',async()=>{
 configured();global.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.messages[0].content,/150字/);assert.equal(JSON.parse(body.messages[1].content).context,'Elle ouvre la fenêtre.');return Response.json({choices:[{message:{content:'fenêtre，阴性名词：窗户。'}}]})};
 const response=await study.POST(request({task:'word',text:'fenêtre',context:'Elle ouvre la fenêtre.'}));assert.equal(response.status,200);assert.match((await response.json()).text,/窗户/);
});
test('long French text splits within request limits without losing characters',()=>{
 const text=('Élise regardait le jardin. « Bonjour ! »\n').repeat(500);
 const chunks=splitText(text);assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=3500));assert.equal(chunks.join(''),text);
});
