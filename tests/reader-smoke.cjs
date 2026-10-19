const {chromium}=require('playwright');
const assert=require('node:assert/strict');
function wav(){const samples=24000*2,buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(24000,24);buffer.writeUInt32LE(48000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);return buffer;}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let translations=[],lookups=[],speech=[],failOnce=true;
 await page.route('**/api/capabilities',r=>r.fulfill({json:{translation:true,speech:true}}));
 await page.route('**/api/study',async r=>{
  const body=r.request().postDataJSON();
  if(body.task==='translate'){
   translations.push(body);
   if(translations.length===2&&failOnce){failOnce=false;await r.fulfill({status:502,json:{error:'测试服务暂时不可用'}});return;}
   await new Promise(resolve=>setTimeout(resolve,80));
   await r.fulfill({json:{text:`${body.lang==='en'?'EN':'中文译文'}：${body.text}`}});
  }else {lookups.push(body);await new Promise(resolve=>setTimeout(resolve,120));await r.fulfill({json:{text:`${body.text}：本句中的中文释义。`}});}
 });
 await page.route('**/api/speech',async r=>{speech.push(r.request().postDataJSON());await r.fulfill({contentType:'audio/wav',body:wav()})});
 assert.equal((await page.goto(process.env.APP_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'})).status(),200);
 await page.getByRole('button',{name:'重试翻译',exact:true}).waitFor();
 assert.equal(translations.length,2);
 await page.getByRole('button',{name:'重试翻译',exact:true}).click();
 await page.getByText('译文已准备 · 6/6 段',{exact:true}).waitFor();
 assert.equal(translations.length,7,'only failed and unfinished paragraphs should retry');
 console.log('PASS: automatic whole-book translation, including unopened chapters; failure retry preserves completed paragraphs');
 await page.getByRole('combobox',{name:'阅读模式',exact:true}).selectOption('zh');
 assert.equal(await page.locator('.translation').count(),4);
 assert.match(await page.locator('.translation').first().innerText(),/中文译文/);
 const count=translations.length;await page.reload({waitUntil:'networkidle'});
 await page.getByText('译文已准备 · 6/6 段',{exact:true}).waitFor();
 assert.equal(translations.length,count,'cached translations should survive reload');
 console.log('PASS: bilingual display and persisted translation cache');
 const paragraph=page.locator('.paragraph').first(),tokens=paragraph.locator('.word-token');
 await tokens.nth(0).hover();await page.waitForTimeout(80);await tokens.nth(1).hover();
 await page.getByRole('dialog',{name:'matin 的释义',exact:true}).waitFor();
 await page.getByText('本地词典 · 不调用 AI',{exact:true}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'收藏此义项',exact:true}).first().waitFor();
 assert.equal(lookups.length,0,'hover must never call the AI service');
 await page.getByRole('dialog').getByRole('button',{name:'AI 解释本句',exact:true}).click();
 await page.getByText('matin：本句中的中文释义。',{exact:true}).waitFor();
 assert.equal(lookups.length,1);assert.match(lookups[0].context,/Chaque matin/);
 await page.getByRole('dialog').getByRole('button',{name:'收藏 AI 释义',exact:true}).click();
 await page.getByRole('button',{name:'保存到生词本',exact:true}).click();
 await page.getByRole('button',{name:'生词本',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'编辑释义',exact:true}).inputValue(),'matin：本句中的中文释义。');
 console.log('PASS: local hover makes zero AI calls; manual AI explanation and saving work');
 await page.getByRole('button',{name:'沉浸阅读',exact:true}).click();
 await page.locator('.paragraph').first().locator('.word-token').nth(1).hover();
 await page.getByRole('dialog',{name:'matin 的释义',exact:true}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'AI 解释本句',exact:true}).click();
 await page.getByText('matin：本句中的中文释义。',{exact:true}).waitFor();
 assert.equal(lookups.length,1,'manual AI explanations should use the contextual cache');
 await page.getByRole('dialog').getByRole('button',{name:'关闭释义',exact:true}).click();
 await page.getByRole('button',{name:'偏好设置',exact:true}).click();
 await page.getByRole('combobox',{name:'朗读方式',exact:true}).selectOption('cloud');
 await page.getByRole('button',{name:'沉浸阅读',exact:true}).click();
 await page.getByRole('button',{name:'连续朗读',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('audio')===null); // playback uses an off-DOM HTMLAudioElement
 await page.waitForTimeout(500);
 assert.equal(speech.length,1);assert.match(speech[0].text,/Chaque matin/);
 await page.getByRole('button',{name:'暂停朗读',exact:true}).first().click();
 await page.getByText('朗读已暂停',{exact:true}).waitFor();
 await page.getByRole('button',{name:'停止',exact:true}).first().click();
 await page.waitForTimeout(2400);assert.equal(speech.length,1,'stop must prevent the next paragraph');
 console.log('PASS: cloud speech request, pause, stop and cancellation of continuous reading');
 await page.getByRole('button',{name:'我的书架',exact:true}).click();
 await page.getByRole('button',{name:'导入原创测试 EPUB',exact:false}).click();
 await page.getByText('译文已准备 · 3/3 段',{exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'阅读模式',exact:true}).inputValue(),'zh');
 assert.match(await page.locator('.translation').nth(1).innerText(),/中文译文/);
 console.log('PASS: importing an EPUB automatically starts translation and shows bilingual text');
 await page.getByRole('combobox',{name:'阅读模式',exact:true}).selectOption('en');
 await page.getByText('译文已准备 · 3/3 段',{exact:true}).waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.translation')).every(e=>e.textContent.startsWith('EN')));
 console.log('PASS: changing language automatically translates to English');
 assert.deepEqual(errors,[]);console.log('PASS: no browser runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
