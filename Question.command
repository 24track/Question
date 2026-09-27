#!/bin/bash
# Double-click this to launch Question without opening Terminal yourself.
# Works no matter where you've moved this folder, since it always looks for
# npm/Electron relative to its own location, not a fixed path.

# cd into the folder this file itself lives in (so it works wherever the
# project folder has been moved to).
cd "$(dirname "$0")" || {
  echo "Couldn't find the project folder — try running this from its usual location."
  read -rp "Press Enter to close this window..."
  exit 1
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm isn't installed. Install Node.js from https://nodejs.org first, then try again."
  read -rp "Press Enter to close this window..."
  exit 1
fi

# First run (or after pulling new code) needs dependencies installed once.
if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (this can take a minute)..."
  npm install || {
    echo "npm install failed — see the error above."
    read -rp "Press Enter to close this window..."
    exit 1
  }
fi

npm start

echo
echo "Question has closed."
read -rp "Press Enter to close this window..."
