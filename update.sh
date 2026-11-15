#!/data/data/com.termux/files/usr/bin/sh
# Pull the newest code, install packages, restart the watcher.
cd "$(dirname "$0")" || exit 1
git pull && npm install && sh ./run.sh