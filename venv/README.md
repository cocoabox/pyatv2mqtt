## prep-niconico-venv.sh

Creates the niconico.py venv. You need python-3.8 or above for this to work.
To install python-3.8 or above, build/install from source.
Also, alias python3 to your latest python-3.8

```
sudo update-alternatives --install /usr/bin/python3 python /usr/bin/python3.8 1
```

If you see error messages about "lsb_release", edit : `/usr/bin/lsb_release` and change the first line to 

```
#!python3 -Es
```

Or, you can fix bad symlinks yourself.

### install-libffi7.sh

After upgrading your python3, you may experience `libffi7.so not found` error when installing pyatv.
Run this sctipt to install libffi7.so from source.

## prep-pyatv-venv.sh

Run to prepare the pyatv venv

## prep-yt-dlp-venv.sh

Run to prepare the Youtube-dl venv
