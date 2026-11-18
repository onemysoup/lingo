'use strict';
// Separate speech transport from the conversation model. No credentials are persisted here.
(function (root) {
  function validateOptions(options) {
    const source = options.speechSource || 'browser';
    if (!['browser', 'edge', 'tts', 'audio-chat'].includes(source)) throw Error('请选择支持的朗读方式。');
    const speed = Number(options.speechSpeed ?? .95);
    if (!Number.isFinite(speed) || speed < .6 || speed > 1.3) throw Error('请选择 0.6–1.3 倍的语速。');
    if (source === 'browser') return { source, speed };
    // Edge always needs its own bridge; never send a conversation key to it.
    const base = (options.speechBase || (source === 'edge' ? '' : options.base) || '').trim().replace(/\/+$/, '');
    if (!base) throw Error(source === 'edge' ? '请填写已启动的 Edge 语音桥接地址，例如 http://localhost:8765/v1。' : '请填写语音服务地址，或先填写对话 API 地址。');
    let url;
    try { url = new URL(base); } catch { throw Error('语音服务地址格式不正确。'); }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('语音服务请使用 HTTPS；本机 localhost 可以使用 HTTP。');
    if (url.username || url.password || url.search || url.hash) throw Error('语音地址不应包含密钥、查询参数或 # 片段。');
    if (/\/(audio\/speech|chat\/completions)$/.test(url.pathname)) throw Error('请填写 Base URL（例如以 /v1 结尾），不需要附加具体接口路径。');
    const model = source === 'edge' ? 'edge-tts' : (options.speechModel || '').trim();
    const voice = (options.speechVoice || '').trim();
    if (!model) throw Error('请填写语音模型 ID，不能直接使用只支持文本的对话模型。');
    if (!voice) throw Error('请填写该语音服务支持的音色 ID。');
    return { source, speed, base, model, voice };
  }
  function browserVoices() {
    return root.speechSynthesis?.getVoices().filter(v => /^en(?:-|_)/i.test(v.lang)) || [];
  }
  function decodeAudio(data) {
    if (typeof data !== 'string' || !data.length) throw Error('模型没有返回音频数据。请确认该模型和接口支持音频输出。');
    let binary;
    try { binary = root.atob(data); } catch { throw Error('服务返回的音频不是有效的 Base64 数据。'); }
    return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: 'audio/mpeg' });
  }
  class SpeechPlayer {
    constructor() { this.generation = 0; this.audio = null; this.objectURL = null; this.abort = null; }
    cancel() {
      this.generation++;
      this.abort?.abort(); this.abort = null;
      if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio = null; }
      if (this.objectURL) { URL.revokeObjectURL(this.objectURL); this.objectURL = null; }
      root.speechSynthesis?.cancel();
    }
    async play(text, options, keys = {}) {
      this.cancel();
      const generation = this.generation;
      const spec = validateOptions(options);
      if (!String(text).trim()) throw Error('没有可朗读的文字。');
      if (spec.source === 'browser') {
        if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) throw Error('当前浏览器不支持系统朗读，可以选择在线语音服务。');
        const utterance = new root.SpeechSynthesisUtterance(text);
        const voices = browserVoices();
        const voice = voices.find(v => v.voiceURI === options.browserVoice)
          || voices.find(v => /natural|neural|online/i.test(v.name))
          || voices.find(v => !v.localService) || voices.find(v => v.lang === 'en-US') || voices[0];
        if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'en-US';
        utterance.rate = spec.speed;
        utterance.onerror = e => {
          if (generation === this.generation && !['canceled', 'interrupted'].includes(e.error)) options.onError?.(Error('浏览器朗读失败，请换一种音色或语音服务。'));
        };
        root.speechSynthesis.speak(utterance);
        return true;
      }
      const sameService = spec.base === (options.base || '').trim().replace(/\/+$/, '');
      const key = spec.source === 'edge' ? '' : keys.speechKey || (sameService ? keys.apiKey : '');
      if (spec.source !== 'edge' && !key) throw Error(sameService ? '请填写对话 API Key 或独立语音 Key。' : '语音服务与对话服务地址不同，请单独填写语音 Key。');
      const abort = new AbortController(); this.abort = abort;
      const timeout = setTimeout(() => abort.abort(), 45000);
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = 'Bearer ' + key;
      let blob;
      try {
        const isChat = spec.source === 'audio-chat';
        const body = isChat ? {
          model: spec.model, modalities: ['text', 'audio'], audio: { voice: spec.voice, format: 'mp3' },
          messages: [{ role: 'system', content: 'Read the user text aloud verbatim in natural English. Do not answer it or add any words.' }, { role: 'user', content: String(text) }]
        } : { model: spec.model, voice: spec.voice, input: String(text), response_format: 'mp3', speed: spec.speed };
        const response = await fetch(spec.base + (isChat ? '/chat/completions' : '/audio/speech'), { method: 'POST', headers, body: JSON.stringify(body), signal: abort.signal });
        if (!response.ok) {
          let detail = '';
          if (spec.source === 'edge') {
            try { const problem = await response.json(); if (typeof problem.error === 'string') detail = problem.error; } catch {}
          }
          throw Error(detail || `语音接口返回 HTTP ${response.status}。请检查地址、模型、音色、密钥和额度。`);
        }
        if (isChat) {
          const json = await response.json();
          blob = decodeAudio(json.choices?.[0]?.message?.audio?.data);
        } else {
          const type = (response.headers.get('content-type') || '').toLowerCase();
          if (type && !type.startsWith('audio/') && !type.includes('octet-stream')) throw Error('语音接口没有返回音频文件。请确认使用 /audio/speech 兼容服务。');
          blob = await response.blob();
          if (!blob.size) throw Error('语音接口返回了空音频。');
        }
      } catch (e) {
        if (generation !== this.generation) return false;
        if (e.name === 'AbortError') throw Error('语音请求超时，请稍后重试。');
        if (e instanceof TypeError) throw Error('语音服务连接失败。请检查服务是否启动、网络、HTTPS 和 CORS 设置。');
        throw e;
      } finally { clearTimeout(timeout); if (this.abort === abort) this.abort = null; }
      if (generation !== this.generation) return false;
      const objectURL = URL.createObjectURL(blob);
      const audio = new root.Audio(objectURL);
      this.audio = audio; this.objectURL = objectURL;
      // Audio chat APIs generally have no speed parameter. Use pitch-preserving playback rate.
      if (spec.source === 'audio-chat') audio.playbackRate = spec.speed;
      audio.onended = () => { if (generation === this.generation) this.cancel(); };
      audio.onerror = () => {
        if (generation === this.generation) { this.cancel(); options.onError?.(Error('收到的音频无法播放，请检查接口返回格式。')); }
      };
      try { await audio.play(); } catch (e) {
        if (generation !== this.generation) return false;
        this.cancel();
        throw Error(e.name === 'NotAllowedError' ? '浏览器阻止自动播放。请点击回复下方的朗读按钮。' : '音频播放失败，请检查服务返回的 MP3 文件。');
      }
      return true;
    }
  }
  root.LingoSpeech = { SpeechPlayer, validateOptions, browserVoices, decodeAudio };
})(globalThis);
