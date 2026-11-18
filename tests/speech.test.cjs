const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/speech.js');
const { SpeechPlayer, validateOptions } = global.LingoSpeech;
const options = { speechSource:'tts', base:'https://chat.example/v1', speechBase:'https://voice.example/v1', speechModel:'tts-model', speechVoice:'nova', speechSpeed:.95 };
const played = [];
class FakeAudio {
  constructor(src) { this.src=src; played.push(this); }
  async play() { this.didPlay=true; }
  pause() { this.paused=true; }
  removeAttribute() { this.src=''; }
}
global.Audio=FakeAudio;
const response = () => ({ok:true,headers:new Headers({'content-type':'audio/mpeg'}),blob:async()=>new Blob(['fake audio'],{type:'audio/mpeg'})});

test('speech transport, isolation, audio output and cancellation', async () => {
  assert.throws(()=>validateOptions({...options,speechBase:'http://remote.example/v1'}),/HTTPS/);
  assert.throws(()=>validateOptions({...options,speechBase:'https://x.test/v1/audio/speech'}),/Base URL/);
  assert.throws(()=>validateOptions({...options,speechBase:'https://x.test/v1?key=secret'}),/查询/);
  const player=new SpeechPlayer(); let requests=[];
  global.fetch=async(url,init)=>{requests.push({url,init});return response()};
  await assert.rejects(player.play('Hi',options,{apiKey:'conversation-key'}),/单独填写语音 Key/);
  assert.equal(requests.length,0,'A conversation credential must not be leaked to another service');
  await player.play('Hello there.',options,{speechKey:'speech-only'});
  assert.equal(requests[0].url,'https://voice.example/v1/audio/speech');
  assert.equal(requests[0].init.headers.Authorization,'Bearer speech-only');
  const body=JSON.parse(requests[0].init.body);
  assert.deepEqual(body,{model:'tts-model',voice:'nova',input:'Hello there.',response_format:'mp3',speed:.95});
  assert.equal(played.at(-1).didPlay,true);
  const oldAudio=played.at(-1);player.cancel();assert.equal(oldAudio.paused,true);assert.equal(player.objectURL,null);
  await player.play('Same service.',{...options,speechBase:options.base},{apiKey:'conversation-key'});
  assert.equal(requests.at(-1).init.headers.Authorization,'Bearer conversation-key');player.cancel();
  await player.play('Free speech.',{...options,speechSource:'edge',speechBase:'http://localhost:8765/v1',speechVoice:'en-US-AriaNeural'},{apiKey:'never-leak-this',speechKey:'also-not-this'});
  assert.equal(requests.at(-1).init.headers.Authorization,undefined);
  assert.equal(JSON.parse(requests.at(-1).init.body).model,'edge-tts');player.cancel();
  global.fetch=async(url,init)=>{requests.push({url,init});return {ok:true,json:async()=>({choices:[{message:{audio:{data:Buffer.from('fake mp3').toString('base64')}}}]})}};
  await player.play('Exact text.',{...options,speechSource:'audio-chat'},{speechKey:'speech-only'});
  assert.equal(requests.at(-1).url,'https://voice.example/v1/chat/completions');
  const chat=JSON.parse(requests.at(-1).init.body);
  assert.deepEqual(chat.modalities,['text','audio']);assert.equal(chat.audio.format,'mp3');assert.equal(chat.messages[1].content,'Exact text.');player.cancel();
  global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'text only'}}]})});
  await assert.rejects(player.play('Hi',{...options,speechSource:'audio-chat'},{speechKey:'key'}),/没有返回音频/);
  global.fetch=async()=>({ok:false,status:403});await assert.rejects(player.play('Hi',options,{speechKey:'key'}),/HTTP 403/);
  global.fetch=async()=>({ok:true,headers:new Headers({'content-type':'application/json'})});await assert.rejects(player.play('Hi',options,{speechKey:'key'}),/没有返回音频文件/);
  global.fetch=(_url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('canceled','AbortError'))));
  const pending=player.play('Cancel before sound.',options,{speechKey:'key'});player.cancel();assert.equal(await pending,false);
});
