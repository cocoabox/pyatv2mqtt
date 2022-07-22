#!/bin/bash
DIR=$( mktemp -d )
pushd "$DIR"
curl -OL "https://github.com/libffi/libffi/releases/download/v3.3/libffi-3.3.tar.gz"
tar zxf libffi-3.3.tar.gz
cd libffi-3.3
./configure
sudo make install
sudo ldconfig
popd
sudo rm -Rf "$DIR"
