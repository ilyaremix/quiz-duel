"""
Ролики для сообщений бота: card.html → MP4 6 с без звука (Telegram показывает их как GIF) + JPEG-обложка.
Кадры снимаются с остановленными анимациями (currentTime = t), поэтому петля ровная, без пропусков кадров.

Нужны Python Playwright (Chrome) и ffmpeg. Из корня репозитория:
    python3 tools/bot-cards/render.py            # все карточки на обоих языках
    python3 tools/bot-cards/render.py win ru     # одна
Результат - apps/web/public/bot/<kind>-<lang>.mp4 и .jpg (сайт отдаёт их по https://<домен>/bot/...).
"""
import functools
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'bot')
KINDS = ['invite', 'friend', 'waiting', 'rematch', 'win', 'loss', 'draw', 'daily', 'join']
LANGS = ['ru', 'en']
FPS = 30
SECONDS = 6
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def render(page, port, kind, lang):
    page.goto(f'http://127.0.0.1:{port}/tools/bot-cards/card.html?kind={kind}&lang={lang}')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(200)
    card = page.locator('#card')
    frames = tempfile.mkdtemp(prefix=f'card-{kind}-{lang}-')
    try:
        for i in range(FPS * SECONDS):
            page.evaluate('(t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; })', i * 1000 / FPS)
            card.screenshot(path=os.path.join(frames, f'f{i:04d}.png'))
        mp4 = os.path.join(OUT, f'{kind}-{lang}.mp4')
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(frames, 'f%04d.png'),
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4],
            check=True,
        )
        # Обложка - кадр на 1,5 с: сфера и заголовок уже «в движении», конфетти в кадре.
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(frames, f'f{int(FPS * 1.5):04d}.png'), '-q:v', '3', os.path.join(OUT, f'{kind}-{lang}.jpg')],
            check=True,
        )
        return os.path.getsize(mp4)
    finally:
        shutil.rmtree(frames, ignore_errors=True)


def main():
    kinds = [sys.argv[1]] if len(sys.argv) > 1 else KINDS
    langs = [sys.argv[2]] if len(sys.argv) > 2 else LANGS
    os.makedirs(OUT, exist_ok=True)
    httpd = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 320, 'height': 180}, device_scale_factor=2)
            for kind in kinds:
                for lang in langs:
                    size = render(page, httpd.server_address[1], kind, lang)
                    print(f'{kind}-{lang}.mp4  {size // 1024} KB')
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()
