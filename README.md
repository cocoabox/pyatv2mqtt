## pyatv2mqtt

exposes MQTT interface for appleTV using [pyatv](https://github.com/postlund/pyatv).

## requirements

- nodeJS ≥ 14.14
- mqtts broker ; TLS is required ; self-signed certs OK
- python 3.7 ; we'll need [virtual env](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments) facilities bundled with python

## first time

### installing

run `npm i` to install required depdencies.

run `pushd venv && bash prep-pyatv-venv.sh && popd` to install pyatv in a virtual environment.

run `pushd venv && bash prep-yt-dlp-venv.sh && popd` to install pt-dlp in a virtual environment.

### configuring

create `config.json5` in the git root directory. use `config-example.json5` as a reference.

edit or modify [dir.json5](dir.json5) in the git root directory to add more directory quickdials.

## running

`node .`

## publishes : `appletvs/__dir__`

every 80 seconds.

body is JSON array of available "directory" quick-dials. 
to configure directory, edit [dir.json5](dir.json5)

## publishes : `appletvs/{NICKNAME_OR_ID_OR_NAME}`

every 60 seconds, contains status of all scanned apple TVs in the current network, using the default network adapter.

message body is a JSON string, e.g.

```
{
  "name": "寝室",
  "address": "192.168.xx.xx",
  "identifier": "xx:xx:xx:xx:xx:6xx",
  "services": [
    { "protocol": "companion", "port": 49152 },
    { "protocol": "airplay", "port": 7000 },
    { "protocol": "raop", "port": 7000 }
  ],
  "__last_seen__": 1658288319874,    // msec timestamp
  "nickname": "bedroom",
  "apps": {
    // APP IDENTIFIER : LOCALISED NAME
    "tv.abema.AbemaTV": "ABEMA",
    "jp.txcom.vplayer.free": "テレ東動画",
    "com.apple.podcasts": "Podcast",
    "com.apple.TVMovies": "映画",
    "com.amazon.aiv.AIVApp": "Prime Video",
    "com.apple.TVWatchList": "TV",
    "com.apple.TVPhotos": "写真",
    "com.apple.TVAppStore": "App Store",
    "com.apple.Arcade": "Arcade",
    "org.videolan.vlc-ios": "VLC",
    "com.apple.TVSearch": "検索",
    "com.apple.TVHomeSharing": "コンピュータ",
    "com.google.ios.youtube": "YouTube",
    "com.pomelogames.MarsGame": "Mars: Mars",
    "eu.bandainamcoent.pacman256": "PAC-MAN 256",
    "com.apple.TVSettings": "設定",
    "com.netflix.Netflix": "Netflix",
    "com.hipsterwhale.crossy": "Crossy Road",
    "com.skyjos.fileexplorertvfree": "FE File Explorer",
    "com.apple.TVMusic": "ミュージック",
    "developer.apple.wwdc-Release": "Developer"
  },
  "power_state": "off",
  "status": {
    "position": [
      -1, // CURRENT POSITION (SEC), -1 = unknown
      -1  // TOTAL LENGTH (SEC), -1 = unknown
    ],
    "repeat": false,
    "shuffle": false,
    "media_type": "Unknown",
    "device_state": "Idle"
  }
}

```

## subscribes to : `appletvs/{NICKNAME_OR_ID_OR_NAME}/{ACTION}`

when ACTION = `open`, message body is one of the followings, in utf8, without trailing `\n`, processed in the following order:

- youtube URL or `youtube:{YOUTUBE_ID}` 
    - if a youtube playlist URL is supplied, only the first item will be played
    - age-restricted youtube items cannot be played
- m3u8 or mp4 URL
    - must be properly URLEncoded
- directory quickdial name
- app identifier or localisedd name 
    - we prefer full identifier e.g. `com.amazon.aiv.AIVApp` for prime video
    - otherwise a partial match will be done (first match will run)
    - localised app name match will also be done, although not recommended
 
when ACTION = `do`, message is one of the followings, in utf8, without trailing `\n`,

- `up`
- `down`
- `left`
- `right`
- `select`
- `menu`
- `home`
- `turn_on`
- `turn_off`

## publishes : `appletvs/{NICKNAME_OR_ID_OR_NAME}/{ACTION}/result`

body is a JSON string containing the result of the last action performed
