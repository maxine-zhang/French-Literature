# French-Literature · Liseuse 法语文学书房

通过阅读法语 EPUB 文学作品学习听说读写的个人网站。MIT 开源，可在自己的电脑或支持 Node.js 的服务器运行。

## 快速启动

需要 Node.js 22.13+ 和 npm。

```bash
git clone https://github.com/maxine-zhang/French-Literature.git
cd French-Literature
npm install
cp .env.example .env.local
npm run dev
```

打开 http://localhost:3000。先导入自己的未加密 EPUB，或在「我的书架」导入原创测试 EPUB。
Windows 用户可以手动复制 `.env.example` 并命名为 `.env.local`。

## AI 配置

编辑 `.env.local`，或在部署平台设置同名的服务端环境变量：

| 变量 | 用途 |
| --- | --- |
| `AI_API_KEY` | 自己的 AI 服务密钥 |
| `AI_BASE_URL` | 支持 Chat Completions 的 API 基础地址，默认 `https://api.openai.com/v1` |
| `AI_MODEL` | 服务商支持的模型名称，示例为 `gpt-4.1-mini` |
| `APP_PASSWORD` | 网站访问密码；用户名任意，密码使用此值 |

密钥只在服务端使用。不要将真实密钥提交到 GitHub。修改配置后重启服务。
生产环境必须设置 `APP_PASSWORD`，否则 AI 接口拒绝工作。部署到互联网时必须使用 HTTPS，并建议在平台添加限流与使用额度控制。API 使用可能由服务商另行计费。

未配置 AI 仍可导入、阅读、浏览器朗读、录音、手动管理生词和复习。翻译、词义解释、语法分析、赏析与写作反馈需要真实 AI 配置，不包含假答案。

## 运行与部署

```bash
npm run typecheck
npm run build
npm start
```

可部署到支持 Next.js 的托管平台或 Node.js 服务器。此项目有服务端 API，不能作为纯静态 GitHub Pages 网站直接部署。仓库源码和此前的 ChatGPT 私人托管站点是独立副本；GitHub 提交不会自动更新原站点。

## 已实现

- EPUB 章节解析、目录、段落位置与阅读进度保存。
- 原文、可选法中／法英对照，导入后自动逐段翻译与缓存，支持暂停、继续和失败重试。
- 悬停法语单词自动显示上下文中文释义；支持键盘聚焦和手机点击、听发音及收藏。
- 点击法语词语、语法解析、文学赏析与写作反馈。
- 云端法语 AI 朗读及可选设备法语语音，支持速度、暂停、段落高亮和连续播放。
- 逐句跟读、循环示范、麦克风录音与回听。
- 生词本、上下文例句、释义编辑、笔记、筛选与返回原文。
- 词义回忆、听音辨义、拼写；间隔复习与每日新词限制。
- 阅读时间、复习记录、书签、深色模式、JSON 备份恢复。

## 数据与已知限制

书籍、进度、词汇和记录保存在当前浏览器 IndexedDB，清理浏览器数据会删除它们，请定期导出备份。没有跨设备同步。朗读依赖设备的法语声音，麦克风录音需要 HTTPS 或 localhost；录音仅供本次回听，不长期保存。

EPUB 目前提取纯文本，不保留原始排版和封面，不支持 DRM；原 EPUB 文件不保留。赏析只发送当前片段和已读上下文，但模型仍可能凭已有知识意外剧透。

专业发音评分、语音识别、多轮对话、交互式自动批改习题和丰富的划线批注尚未实现。AI 练习以文本形式展示。图片和复杂排版可能丢失。生词释义当前可手动填写，AI 解释需服务配置。外部字体不可用时自动使用系统字体。

## 项目结构

- `app/page.tsx`：阅读与学习界面、IndexedDB 保存、录音与复习。
- `app/api/study/route.ts`：服务端 AI 接口。
- `app/globals.css`：响应式阅读界面。
- `proxy.ts`：可选的网站访问密码保护。
- `public/sample.epub`：原创法语测试文本。

## 验证

原网站已在浏览器中验证真实 EPUB 导入、模式切换、点击词语、收藏、复习答案、三天后排期及刷新保存。独立项目另进行 TypeScript 与生产构建验证。实际 AI 内容与麦克风效果需要配置服务和设备测试。

## 开源协议

MIT，见 [LICENSE](LICENSE)。第三方依赖遵循各自许可证。请勿把自己的受版权保护电子书或学习备份提交到公开仓库。

## 自动翻译、悬停词典与云端法语朗读

导入 EPUB 后默认显示双语对照，并自动翻译当前打开书籍的全部章节。原文可立即阅读，无需选中或点击翻译。切换为法英对照会自动准备英文译文；仅原文模式下仍会准备偏好语言的译文。译文保存在当前浏览器 IndexedDB，刷新后继续未完成的段落；切换书籍时暂停原书任务，再打开时继续。翻译状态栏提供暂停、继续和失败重试。全文内容将逐段发送至配置的 AI 服务，可能产生费用；关闭页面后不会继续翻译。

鼠标停留单词约 400 毫秒后浮现中文上下文释义；Tab 聚焦、手机点击也可查询。快速移开会取消旧查询；本次页面会话中相同单词和上下文命中缓存。浮窗支持听发音和把词义一起收藏到生词本。释义由 AI 生成，不能保证等同于专业词典。

默认选择云端语音：OpenAI `gpt-4o-mini-tts` + `marin`，以法语指令指定法国法语发音和自然连读。服务端配置：

| 变量 | 用途 |
| --- | --- |
| `TTS_API_KEY` | OpenAI API 密钥；若文本 AI 也使用默认 OpenAI 地址，可复用 `AI_API_KEY` |
| `TTS_MODEL` | 默认 `gpt-4o-mini-tts` |
| `TTS_VOICE` | 默认 `marin`，也可选 `cedar` 等服务支持的声音 |

选择独立语音密钥时，翻译仍需要 `AI_API_KEY`。生产环境两类 API 均要求 `APP_PASSWORD`。在 Vercel 的项目环境变量中安全设置，随后重新部署；不要提交 `.env.local`。云端开发环境还需允许 `api.openai.com` 的出站 HTTPS。其他兼容文本模型平台的密钥不会自动用于 OpenAI 语音。

云端语音仅朗读时请求，使用音频缓存避免本次会话中的重复生成；长段落自动分块。没有语音配置时会明确报错，可在「偏好设置 → 朗读方式」切换设备法语语音。设备必须实际提供法语声音，不会使用其他语言声音冒充法语。云端声音由 AI 生成；发音质量请配置后试听比较，不提供专业发音评分。

模型与参数依据：[OpenAI Speech 参数定义](https://github.com/openai/openai-python/blob/main/src/openai/types/audio/speech_create_params.py)、[语音合成文档](https://developers.openai.com/api/docs/guides/text-to-speech)。

开发验证：`node --test tests/api.test.cjs`，`npm run typecheck`，`npm run build`。浏览器集成检查见 `tests/reader-smoke.cjs`，先启动应用，再运行 `node tests/reader-smoke.cjs`（需要 Playwright 和 Chromium；测试模拟 AI/语音响应，不产生真实 API 费用）。
