#!/bin/bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
pushd "$SCRIPT_DIR" >/dev/null
ZIP="niconico_venv-`uname`.txz"


if [[ -f "$ZIP" ]]; then
    echo "## Unzipping : $ZIP" >&2
    tar xJf "$ZIP"
else 
    echo "## Creating niconico_venv and installing stuff" >&2
    set -e
    python3 -m venv niconico_venv
    source niconico_venv/bin/activate
    pip3 install niconico.py

    echo "## Zipping for faster access later : $ZIP" >&2
    tar cJf "$ZIP" niconico_venv
fi
popd >/dev/null
