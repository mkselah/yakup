#!/data/data/com.termux/files/usr/bin/sh
# Stops the watcher.
if pkill -f "node src/index.js"; then
  echo "watcher stopped"
else
  echo "watcher was not running"
fi