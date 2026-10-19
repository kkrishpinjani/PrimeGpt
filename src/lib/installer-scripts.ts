export type InstallerOs = "windows" | "mac" | "linux";

export function parseOs(v: string | null): InstallerOs {
  return v === "mac" ? "mac" : v === "linux" ? "linux" : "windows";
}

export const installerFile = (os: InstallerOs) =>
  os === "windows" ? { name: "RecruitGPT-Helper-Setup.cmd", label: "Windows computer" }
    : os === "mac" ? { name: "RecruitGPT-Helper-Setup.command", label: "Mac" }
      : { name: "RecruitGPT-Helper-Setup.sh", label: "Linux computer" };

/** macOS / Linux installer (bash). Installs, pairs with a single-use code, autostarts via launchd / systemd --user. */
export function buildUnixScript(os: "mac" | "linux", server: string, code: string): string {
  const autostart =
    os === "mac"
      ? `PLIST="$HOME/Library/LaunchAgents/ai.recruitgpt.helper.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>ai.recruitgpt.helper</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/run.sh</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"`
      : `mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/recruitgpt-helper.service" <<UNIT
[Unit]
Description=RecruitGPT Local Helper
[Service]
ExecStart=/bin/bash $DIR/run.sh
Restart=always
[Install]
WantedBy=default.target
UNIT
if ! (systemctl --user daemon-reload && systemctl --user enable --now recruitgpt-helper.service); then
  nohup /bin/bash "$DIR/run.sh" >/dev/null 2>&1 &
fi`;
  const nodeHelp =
    os === "mac"
      ? `if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then brew install node; else echo "Please install Node.js 20+ from https://nodejs.org and run this again."; exit 1; fi
fi`
      : `if ! command -v node >/dev/null 2>&1; then echo "Please install Node.js 20+ (https://nodejs.org or your package manager) and run this again."; exit 1; fi`;
  return `#!/usr/bin/env bash
# RecruitGPT Local Helper: one-time setup. Works in YOUR browser, on YOUR connection. Never sees your LinkedIn/Indeed password.
set -e
SERVER="${server}"
CODE="${code}"
DIR="$HOME/.recruitgpt-helper"
${nodeHelp}
mkdir -p "$DIR" && cd "$DIR"
echo "Downloading the helper..."
curl -fsSL "$SERVER/helper/helper.mjs" -o helper.mjs
[ -f package.json ] || echo '{"name":"recruitgpt-helper","private":true}' > package.json
echo "Installing browser control library..."
npm install playwright-core --no-audit --no-fund --silent
echo "Pairing with your workspace..."
node helper.mjs pair "$CODE" --server "$SERVER"
cat > run.sh <<'RUN'
#!/usr/bin/env bash
cd "$(dirname "$0")"
while true; do node helper.mjs run || true; sleep 5; done
RUN
chmod +x run.sh
${autostart}
echo "Opening the RecruitGPT browser window..."
node helper.mjs chrome
echo
echo "Done. Sign in to LinkedIn Recruiter and/or Indeed in the window that just opened, then leave it open."
echo "Your RecruitGPT Integrations page should show this computer as ONLINE."
`;
}

/** Windows installer (.cmd, CRLF). */
export function buildWindowsScript(server: string, code: string): string {
  return String.raw`@echo off
setlocal EnableDelayedExpansion
title RecruitGPT Local Helper setup
set "SERVER=${server}"
set "CODE=${code}"
set "DIR=%LOCALAPPDATA%\RecruitGPT"

echo.
echo  RecruitGPT Local Helper - one-time setup
echo  ----------------------------------------
echo  This installs a small helper that works in YOUR browser, on YOUR connection.
echo  It never sees your LinkedIn or Indeed password.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Installing it now ^(Windows will ask for permission^)...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js installed. Please CLOSE this window and double-click the installer again.
  pause
  exit /b 0
)

if not exist "%DIR%" mkdir "%DIR%"
cd /d "%DIR%"

echo Downloading the helper...
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing '%SERVER%/helper/helper.mjs' -OutFile 'helper.mjs'" || goto :fail
if not exist package.json echo {"name":"recruitgpt-helper","private":true} > package.json
echo Installing browser control library...
call npm install playwright-core --no-audit --no-fund --silent || goto :fail

echo Pairing with your workspace...
node helper.mjs pair %CODE% --server %SERVER% || goto :fail

> run.cmd echo @echo off
>> run.cmd echo :loop
>> run.cmd echo node "%DIR%\helper.mjs" run
>> run.cmd echo if errorlevel 75 goto loop
>> run.cmd echo timeout /t 5 /nobreak ^>nul
>> run.cmd echo goto loop

schtasks /Create /SC ONLOGON /TN "RecruitGPT Local Helper" /TR "\"%DIR%\run.cmd\"" /RL LIMITED /F >nul
echo Opening the RecruitGPT browser window...
node helper.mjs chrome
start "RecruitGPT Local Helper" /min "%DIR%\run.cmd"

echo.
echo  Done. In the browser window that just opened, sign in to LinkedIn Recruiter and/or Indeed,
echo  then leave it open. Your RecruitGPT Integrations page should show this computer as ONLINE.
echo  The helper starts automatically each time you sign in to Windows and updates itself.
echo.
pause
exit /b 0

:fail
echo.
echo  Setup failed. Please send a screenshot of this window to support.
pause
exit /b 1
`.replace(/\n/g, "\r\n");
}
