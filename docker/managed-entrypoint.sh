#!/bin/sh
set -e
Xvfb :99 -screen 0 1366x800x24 &
sleep 1
x11vnc -display :99 -forever -shared -nopw -localhost -quiet &
websockify --web /usr/share/novnc 6080 localhost:5900 &
# pair once (the code is single-use); afterwards the stored token in /data is used
if [ ! -f /data/.recruitgpt/config.json ] && [ -n "$RGPT_PAIR_CODE" ]; then
  node helper.mjs pair "$RGPT_PAIR_CODE" --server "$RGPT_SERVER"
fi
node helper.mjs chrome
while true; do node helper.mjs run || true; sleep 5; done
