#! /bin/bash
set -euxo pipefail

# Assumes git for windows is installed.

# The next person who sets up windows, actually update this script.
winget install bun
winget install just
winget install 1password-cli
winget install rustup
