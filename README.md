# Lingo · 英语开口练习室

一个可以自行接入 OpenAI 兼容模型 API 的英语口语训练产品。界面为中文，练习与对话为英文。

## 启动

零依赖静态网站。可将 `dist/` 部署到任意静态托管平台，或在本机运行：

```sh
python3 -m http.server 8080 --directory dist
```

打开 `http://localhost:8080`。语音输入需要 localhost 或 HTTPS，以及浏览器麦克风授权。Chrome / Edge 支持情况通常较好；不支持语音识别时可以使用文字输入。

## 已实现

- 6 个情景：咖啡点单、旅行问路、职场会议、社交破冰、观点讨论、餐厅美食。
- 话题分类、关键词搜索、话题收藏。
- 口语练习对话、浏览器英语语音识别、可编辑的语音转写。
- 系统音色选择、Edge 在线语音桥接、独立 TTS API、兼容音频输出模型的朗读、语速调整、试听和停止。
- 示例模式；API 模式下使用真实上下文生成回复与地道表达建议。
- 自定义情景、A2/B1/B2/C1 难度偏好。
- 表达收藏本、练习记录、近 7 天练习时长和每日目标。
- 响应式布局、6 张随包提供的 SVG 场景插画。

## API 接入

在“API 与偏好设置”中选择 API 模式，填写：

- **API Base URL**：例如 `https://your-service.example.com/v1`。不要包含 `/chat/completions`，程序会自动追加。
- **模型名称**：填写你的服务支持的模型 ID。
- **API Key**：仅保留在当前页面的内存中，刷新页面后需重新填写。

点击“测试连接”，成功后保存设置。

程序使用 `POST {base}/chat/completions`，请求内容：

```json
{
  "model": "your-model",
  "messages": [
    {"role": "system", "content": "场景、难度及口语教练指令"},
    {"role": "assistant", "content": "对话内容"},
    {"role": "user", "content": "用户的英文回复"}
  ],
  "temperature": 0.4
}
```

请求头为 `Content-Type: application/json` 和 `Authorization: Bearer <key>`。
服务应返回 `choices[0].message.content` 字符串。系统提示词要求模型把该字符串组织为以下 JSON：

```json
{
  "reply": "Natural English response and follow-up question.",
  "natural": "A more idiomatic version of the learner's own sentence.",
  "explanation": "用中文解释为什么这样说更自然。",
  "feedback": "针对这次实际回复的简短建议。"
}
```

不返回结构化 JSON 时，产品会展示纯文本回复，并提示本轮没有结构化反馈。错误响应、超时和网络失败都有明确提示。

## 部署与扩展

- 当前版本的密钥由浏览器直接用于请求你填写的 API。服务端需支持 CORS。正式产品建议接入你自己的后端代理，把供应商密钥放在服务端。
- 语音输入仍用浏览器内置识别；朗读由 `dist/speech.js` 统一管理。可用系统声音、Edge 桥接、TTS API，或明确支持音频输出的 Chat Completions 服务。
- 语音识别由浏览器提供商处理；本产品未实现声学发音评分、实时语音打断或 WebSocket 音频流。
- `topics` 数组维护话题；`systemPrompt()` 管理角色、语言水平和反馈提示词；`completion()` 是模型 API 适配入口。
- 练习记录、收藏和非敏感偏好保存到本机 localStorage，不会跨设备同步。API Key 不写入 localStorage。
- 示例对话和表达建议均为预设内容，会在练习界面明确标注；API 模式才提供针对实际回复的生成反馈。
- 当前没有账号、多用户服务端存储、支付、排行榜或云端进度同步。

## 文件

`dist/index.html` 页面结构；`dist/style.css` 样式；`dist/app.js` 产品逻辑；`dist/scenarios.js` 逐场景约束；`dist/speech.js` 语音适配；`dist/images/` 内置插画。

`server/voice_server.py` 是可选的本机 Edge 语音桥接，同时可以提供前端页面。`tests/` 为语音、场景和原有产品行为的检查。

`make-art.py` 用于重新生成插画。部署配置在 `.openai/hosting.json`。


## 推荐：Agnes 对话 + Edge 在线朗读

Agnes 用于生成英文回复和中文反馈；朗读由单独的语音服务完成。不能因为模型支持多模态，就推断它支持音频输出。查到的 [Agnes 官方语音接入说明](https://github.com/AgnesAI-Labs/agnes-harness/blob/main/docs/guide/voice.md) 同样采用独立语音服务；其 [API 概览](https://agnes-ai.com/en/docs/overview) 提供对话 Base URL。

1. 在解压后的 `lingo` 目录运行：

```sh
python3 -m pip install -r server/requirements.txt
python3 server/voice_server.py
```

2. 打开 `http://localhost:8765`。
3. 在“API 与偏好设置”点击“填入 Agnes 对话配置”，填写你自己的 Agnes Key。对话 Base URL 为 `https://apihub.agnes-ai.com/v1`，模型 ID 为 `agnes-3.0-flash`（以你的平台实际可用名称为准）。
4. 朗读方式选 **Edge 在线语音**。桥接地址默认 `http://localhost:8765/v1`，无需语音 Key。
5. 音色可先用 `en-US-AriaNeural` 或 `en-US-JennyNeural`（美音），也可试 `en-GB-SoniaNeural`（英音）。语速选 `0.95×`，点击“试听声音”，满意后保存。当前可用音色以 `edge-tts --list-voices` 为准。

`edge-tts` 使用 Edge 在线朗读，不需要下载语音包或申请微软 Key，但需要能够访问微软语音服务的网络。它是第三方项目的在线服务接入，并非有 SLA 的正式 Azure TTS API，不承诺永久免费、可用性或生产商用额度。[项目说明](https://github.com/rany2/edge-tts)

桥接服务默认只监听本机。若前端在其他端口，默认允许 localhost:8080。可用 `LINGO_ALLOWED_ORIGINS` 设置允许的前端来源（逗号分隔完整 origin）；生产部署应使用有鉴权的 HTTPS 后端代理。本机帮助服务不能直接部署到静态托管。

## 使用其他语音 API / 多模态音频输出

- **TTS API**：填写语音服务 Base URL、它提供的 TTS 模型 ID、音色 ID和独立 Key。发送 `POST /audio/speech`，参数为 `model / input / voice / response_format: mp3 / speed`，返回音频二进制。音色、模型及参数支持范围以服务商文档为准。
- **音频输出模型**：仅在服务明确支持 OpenAI 风格音频输出时使用。发送 `POST /chat/completions`，含 `modalities: ["text", "audio"]` 和 `audio: {voice, format: "mp3"}`，从 `choices[0].message.audio.data` 读取 Base64 音频。这条路径为朗读已有的英文回复，不会取代对话模型；其他原生协议需要增加适配器。
- 同一 Base URL 可复用对话 Key；不同语音地址必须单独填写语音 Key。Edge 桥接绝不携带 Agnes Key。所有 Key 均仅保存在当前页面内存。
- 未提供 Agnes 的音频生成接口文档，因此没有把 `agnes-3.0-flash` 配成语音模型，也不假定它兼容上述音频输出参数。

## 每个 Small Talk 场景的约束

`dist/scenarios.js` 对六个场景分别定义：角色、学习任务、固定场景事实、对话步骤、话题边界和自然结束条件。自定义场景也套用同样的短对话规则。

`systemPrompt()` 把这些约束作为 system 消息发送给模型：

- 口语回复 1–2 个短句、最多一个问题；允许只回应不提问。
- 按级别限制英文词数：A2 24，B1 35，B2 45，C1 55。
- 不重复询问已经提供的信息，不用连续追问撑长聊天。
- 不切换角色、不突然转到人生规划或无关话题、不虚构场景中的价格、时刻表或用户经历。
- 自然承接对方的话，任务完成后允许礼貌结束。
- 不在朗读内容里插入中文纠错、列表、文章、动作说明或机械夸奖。
- 地道表达、中文解释和建议放在单独 JSON 字段，展示在反馈区。
- 降低生成温度至 `0.4`。前端也检查过长回复、多重提问、中文/列表等格式异常，提示重试，不把长篇内容直接朗读出来。

提示词与格式检查能减少跑题，语义上是否始终贴合场景仍需用实际模型测试，不能保证每轮完全遵守。

## 验证

```sh
node --test tests/speech.test.cjs
node tests/app.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

检查覆盖语音请求格式、不同服务密钥隔离、音频响应、取消、场景提示词传递和对话格式限制。自动检查使用模拟响应；Edge 真实联网音质、供应商 API 和浏览器播放需在你的设备上试听验证。
