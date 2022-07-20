#!/bin/bash
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
pushd "$SCRIPT_DIR" >/dev/null
ZIP="pyatv_venv-`uname`.txz"


if [[ -f "$ZIP" ]]; then
    echo "## Unzipping : $ZIP" >&2
    tar xJf "$ZIP"
else 
    echo "## Creating pyatv_venv and installing stuff" >&2
    set -e
    python3 -m venv pyatv_venv
    source pyatv_venv/bin/activate
    pip3 install pyatv

    ERROR_STR=$( pyatv_venv/bin/atvremote 2>&1 | grep ImportError | grep miniaudio )
    if [[ ! -z "$ERROR_STR" ]]; then
        echo "`tput rev`## Trying to patch miniaudio 1.51, for more info read : https://github.com/irmen/pyminiaudio/issues/52`tput sgr0`" >&2
        mkdir pyatv_venv/manually_build
        pushd pyatv_venv/manually_build
        git clone https://github.com/irmen/pyminiaudio/
        pushd pyminiaudio
        git checkout 55614d3e6f0d74560f1aadb46e2f60ec4aea0bc1
        echo 'diff --git a/build_ffi_module.py b/build_ffi_module.py
index ace7e09..811086d 100644
--- a/build_ffi_module.py
+++ b/build_ffi_module.py
@@ -809,7 +809,7 @@ libraries = []

 if os.name == "posix":
     compiler_args = ["-g1", "-O3", "-ffast-math"]
-    libraries = ["m", "pthread", "dl"]
+    libraries = ["m", "pthread", "dl", "atomic"]

     if "PYMINIAUDIO_EXTRA_CFLAGS" in os.environ:
         compiler_args += shlex.split(os.environ.get("PYMINIAUDIO_EXTRA_CFLAGS", ""))
' | git apply 
        pip3 install .
        popd
        popd
    else 
        echo "## Didn't have any import errors from pyminiaudio. Great!" >&2
    fi

    echo "## Zipping for faster access later : $ZIP" >&2
    tar cJf "$ZIP" pyatv_venv
fi
popd >/dev/null
