#!/bin/bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
pushd "$SCRIPT_DIR" >/dev/null
ZIP="yt_dlp_venv-`uname`.txz"


if [[ -f "$ZIP" ]]; then
    echo "## Unzipping : $ZIP" >&2
    tar xJf "$ZIP"
else 
    echo "## Creating yt-dlp and installing stuff" >&2
    set -e
    python3 -m venv yt_dlp_venv
    source yt_dlp_venv/bin/activate
    pip3 install yt-dlp

    echo "## Zipping for faster access later : $ZIP" >&2
    tar cJf "$ZIP" yt_dlp_venv
fi
popd >/dev/null
