import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest

spec = importlib.util.spec_from_file_location('voice_server', Path(__file__).parents[1] / 'server/voice_server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class BridgeTests(unittest.TestCase):
    def test_text_voice_and_speed_validation(self):
        self.assertEqual(server.validate_payload({'input': ' Hi! ', 'voice': 'en-GB-SoniaNeural', 'speed': .95}), ('Hi!', 'en-GB-SoniaNeural', '-5%'))
        for payload in [None, {'input': ''}, {'input': 'a'*4001}, {'input': 'Hi', 'voice':'<ssml>'}, {'input':'Hi','speed':float('nan')}, {'input':'Hi','speed':4}]:
            with self.assertRaises(ValueError): server.validate_payload(payload)

    def test_collects_audio_chunks_and_passes_voice(self):
        captured = {}
        class Communicate:
            def __init__(self, text, voice, rate): captured.update(text=text, voice=voice, rate=rate)
            async def stream(self):
                yield {'type':'WordBoundary','text':'Hi'}
                yield {'type':'audio','data':b'mp'}
                yield {'type':'audio','data':b'3'}
        previous = sys.modules.get('edge_tts')
        sys.modules['edge_tts'] = types.SimpleNamespace(Communicate=Communicate)
        try:
            self.assertEqual(asyncio.run(server.synthesize('Hi','en-US-AriaNeural','-5%')),b'mp3')
            self.assertEqual(captured, {'text':'Hi','voice':'en-US-AriaNeural','rate':'-5%'})
        finally:
            if previous is None: sys.modules.pop('edge_tts',None)
            else: sys.modules['edge_tts']=previous

if __name__=='__main__': unittest.main()
