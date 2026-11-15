#!/data/data/com.termux/files/usr/bin/sh
# Starts the watcher in the background. Stops an already-running copy first,
# so you never get two copies (= duplicate mails).
cd "$(dirname "$0")" || exit 1
termux-wake-lock
pkill -f "node src/index.js" 2>/dev/null
mkdir -p data
nohup node src/index.js >> data/out.log 2>&1 &
echo "watcher started (pid $!)"