Price watcher (Node.js, runs on PC and on Android via Termux)
PowerShell, if node is not found:
  $env:Path += ";C:\Program Files\nodejs"
Commands:
  npm install        install packages
  npm run check      run all watchers once
  npm start          run forever (hourly loop)
  npm run testmail   send a test mail
Config:
  .env            secrets (never commit)  -> copy from .env.example
  watchers.json   list of pages to watch
Old Google Sheets version: git tag old-sheets-version

npm install
npm run check