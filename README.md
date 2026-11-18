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
- 口语练习对话、浏览器英语语音识别与朗读、可编辑的语音转写。
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
  "temperature": 0.7
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
- 当前语音输入和朗读使用浏览器内置能力，未接入第三方 ASR/TTS。可在 `dist/app.js` 的 `toggleMic()` / `speak()` 中替换。
- 语音识别由浏览器提供商处理；本产品未实现声学发音评分、实时语音打断或 WebSocket 音频流。
- `topics` 数组维护话题；`systemPrompt()` 管理角色、语言水平和反馈提示词；`completion()` 是模型 API 适配入口。
- 练习记录、收藏和非敏感偏好保存到本机 localStorage，不会跨设备同步。API Key 不写入 localStorage。
- 示例对话和表达建议均为预设内容，会在练习界面明确标注；API 模式才提供针对实际回复的生成反馈。
- 当前没有账号、多用户服务端存储、支付、排行榜或云端进度同步。

## 文件

`dist/index.html` 页面结构；`dist/style.css` 样式；`dist/app.js` 产品逻辑；`dist/images/` 内置插画。

`make-art.py` 用于重新生成插画。部署配置在 `.openai/hosting.json`。
