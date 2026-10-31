#!/usr/bin/env python3
"""Reject accidentally restored web-wrapper code or bundled web assets."""
from pathlib import Path
import re
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
android = root / 'android'
source = android / 'app/src/main'
for path in [android / 'settings.gradle', android / 'app/build.gradle', *source.rglob('*.kt'), *source.rglob('*.java'), *source.rglob('*.xml')]:
    text = path.read_text()
    if re.search(r'com\.getcapacitor|android\.webkit\.WebView|<WebView\b|capacitor-android|capacitor-cordova', text):
        raise SystemExit(f'Web wrapper found in {path.relative_to(root)}')
if not (source / 'java/com/zenworkspace/app/MainActivity.kt').is_file():
    raise SystemExit('Native Kotlin entry point is missing')
if len(sys.argv) > 1:
    with zipfile.ZipFile(sys.argv[1]) as apk:
        web = [name for name in apk.namelist() if name.startswith('assets/') and (name.endswith(('.js', '.html', '.css')) or name.startswith('assets/public/'))]
        if web:
            raise SystemExit(f'Bundled web app assets found: {web[:5]}')
print('Native Android architecture verified')
