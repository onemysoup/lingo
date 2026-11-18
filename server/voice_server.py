#!/usr/bin/env python3
"""Serve Lingo and an optional local Edge TTS bridge: python3 server/voice_server.py."""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

DIST = Path(__file__).resolve().parents[1] / 'dist'
PORT = int(os.environ.get('LINGO_VOICE_PORT', '8765'))
ALLOWED_ORIGINS = set(filter(None, os.environ.get('LINGO_ALLOWED_ORIGINS',
    f'http://localhost:{PORT},http://127.0.0.1:{PORT},http://localhost:8080,http://127.0.0.1:8080').split(',')))


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('请求内容应为 JSON 对象。')
    text = payload.get('input', '')
    voice = payload.get('voice', 'en-US-AriaNeural')
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 4000:
        raise ValueError('朗读文本需要包含 1–4000 个字符。')
    if not isinstance(voice, str) or not re.fullmatch(r'en-[A-Z]{2}-[A-Za-z0-9]+Neural', voice):
        raise ValueError('请填写英语 Neural 音色，例如 en-US-AriaNeural。')
    try:
        speed = float(payload.get('speed', .95))
    except (TypeError, ValueError):
        raise ValueError('语速格式不正确。')
    if not math.isfinite(speed) or not .6 <= speed <= 1.3:
        raise ValueError('语速应为 0.6–1.3。')
    return text.strip(), voice, f'{round((speed - 1) * 100):+d}%'


async def synthesize(text, voice, rate):
    try:
        import edge_tts
    except ImportError:
        raise RuntimeError('请先运行 python3 -m pip install -r server/requirements.txt。')
    chunks = []
    async for chunk in edge_tts.Communicate(text, voice, rate=rate).stream():
        if chunk['type'] == 'audio':
            chunks.append(chunk['data'])
    audio = b''.join(chunks)
    if not audio:
        raise RuntimeError('在线语音服务没有返回音频，请重试或更换音色。')
    return audio


class VoiceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def allowed_request(self):
        host = urlsplit('//' + self.headers.get('Host', '')).hostname
        origin = self.headers.get('Origin')
        if host not in {'localhost', '127.0.0.1', '::1'} or (origin and origin not in ALLOWED_ORIGINS):
            self.send_json(403, {'error': '本机服务仅接受指定来源。'})
            return False
        return True

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed_request():
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.allowed_request():
            return
        if self.path == '/health':
            return self.send_json(200, {'ok': True, 'service': 'Lingo Edge TTS bridge'})
        super().do_GET()

    def do_POST(self):
        if not self.allowed_request():
            return
        if self.path != '/v1/audio/speech':
            return self.send_json(404, {'error': '接口不存在。'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32768:
                raise ValueError('请求内容过大或为空。')
            payload = json.loads(self.rfile.read(length))
            text, voice, rate = validate_payload(payload)
        except (ValueError, UnicodeDecodeError) as error:
            return self.send_json(400, {'error': str(error)})
        try:
            audio = asyncio.run(asyncio.wait_for(synthesize(text, voice, rate), timeout=40))
        except RuntimeError as error:
            return self.send_json(503, {'error': str(error)})
        except Exception:
            return self.send_json(502, {'error': 'Edge 在线语音暂不可用，请检查网络或更换服务。'})
        self.send_response(200)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Content-Length', str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)


if __name__ == '__main__':
    # Local helper only. Production should put a protected HTTPS backend in front of TTS.
    server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(VoiceHandler, directory=str(DIST)))
    print(f'Lingo: http://localhost:{PORT} | Voice Base URL: http://localhost:{PORT}/v1', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
