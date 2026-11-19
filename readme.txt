Price watcher (Node.js, runs on PC and on Android via Termux)
PowerShell, if node is not found:
  $env:Path += ";C:\Program Files\nodejs"
Commands:
  npm install        install packages
  npm run check      run all watchers once
  npm start          run forever (hourly loop)
  npm run testmail   send a test mail
Tablet (Termux):
  sh run.sh          start in background (also done by Termux:Boot)
  sh stop.sh         stop
  sh update.sh       git pull + npm install + restart
  tail -f data/log.txt   watch the log
Price watchers (type "price" in watchers.json):
  target   mail when the cheapest price is at or below this (kr)
  excludeShops   list of shop names to ignore, e.g. ["AI Eyewear"]
  times    daily run times, Danish time (default 10:00 and 14:00)
  history  data/prices.csv  (date,name,price,shop)
  alert    mails once per price level; a lower price mails again; going above target re-arms
Config:
  .env            secrets (never commit)  -> copy from .env.example
  watchers.json   list of pages to watch
Old Google Sheets version: git tag old-sheets-version

npm install
npm run check