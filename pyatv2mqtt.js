#!/usr/bin/env node


const mqtt = require('mqtt');
const Queue = require('queue-promise');
const URL = require('url');

const {run_atvremote, run_atvscript} = require('./run-pyatv');
const {get_media_url} = require('./run-youtube-dl');

// the followings are constant, dont change

const TOPIC_PUBLISH_PATTERN = 'appletvs/{ID}';
const TOPIC_SUBSCRIBE_PATTERN = 'appletvs/{ID}/+';  


class Pyatv2mqtt {
    constructor(key, cert, ca, host, port, username, password, device_defs, venv_dir, opts={ }) {
        opts = Object.assign({
            scan_interval: 60, // secs
            dir_interval: 80, // sec
            directory: {},
            yt_dlp_venv_dir: '',
        }, opts);

        this._venv_dir = venv_dir;
        this._youtube_dl_venv_dir = opts.yt_dlp_venv_dir;

        this._device_defs = device_defs;
        this._devices = {};
        this._directory = opts.directory || {};
        this._key = key;
        this._cert = cert;
        this._ca = ca;
        this._host = host;
        this._port = port;
        this._username = username;
        this._password = password;
        this._client = null;

        this._scan_interval = opts.scan_interval;
        this._scan_timer = null;
        this._dir_interval = opts.dir_interval;
        this._dir_timer = null;

        // send message queue
        this._q= new Queue({
            concurrent: 1,
            interval: 500,
        });
        this._q.on('resolve', r => {
            if (typeof r?.on_done === 'function') {
                r.on_done(r);
            }
        });
        this._q.on('reject', r => {
            if (typeof r?.on_error === 'function') {
                r.on_error(r);
            }
        });
        this._device_defs = device_defs;

        this.scan().then(() => {
            this.start_scanning();
        });
        this.dir().then(() => {
            this.start_dir_publishing();
        });
    }



    /**
     * timer function every 60 sec for scanning devices in network
     */
    async scan() {
        try {
            const start_scan_time = Date.now();

            const {out} = await run_atvscript(this._venv_dir, null, null, 'scan');
            console.log("OUT=",out);
            if (Array.isArray(out?.devices)) {
                for (const d of out.devices) {
                    // for each scanned device
                    let device = {...d, __last_seen__: Date.now()};

                    // query nickname from config
                    console.log('querying nickname of', device.identifier);
                    const def = this.get_device_def(d.identifier);
                    let nickname = def.nickname;
                    if (nickname) {
                        device = {...device, nickname};
                    }

                    // query running app (almost always shows "not-supported")
                    // don't bother trying here..

                    // query apps available
                    try {
                        console.log('querying apps of', device.identifier);
                        const {stdout} = await run_atvremote( this._venv_dir, device.identifier, 
                            {companion: this.get_credentials(device.identifier)?.companion},
                            'app_list'
                        );
                        const apps = Object.fromEntries( stdout.join("\n").trim().split(',')
                            .map(a => a.trim())
                            .map(a => { const parsed = /^App: (.*?) \((.*?)\)$/.exec(a); return [parsed[2],parsed[1]]; })
                        );
                        device = {...device, apps};
                    }
                    catch (error) {
                        console.warn('failed while querying apps, error was :', error);
                        device = {...device, apps: null};
                    }

                    // query power state
                    try {
                        console.log('querying power state of', device.identifier);
                        const {stdout} = await run_atvremote( this._venv_dir, device.identifier, 
                            {airplay: this.get_credentials(device.identifier)?.airplay},
                            'power_state'
                        );
                        const power_state = stdout.join("\n").trim() === 'PowerState.Off' 
                            ? 'off' 
                            : 'PowerState.On' ? 'on' : null;
                        device = {...device, power_state};
                    }
                    catch (error) {
                        console.warn('failed while querying power state, error was :', error);
                        device = {...device, power_state: null};
                    }

                    // query "now-playing"
                    try {
                        console.log('querying now-playing of', device.identifier);
                        const {stdout} = await run_atvremote( this._venv_dir, device.identifier, 
                            {airplay: this.get_credentials(device.identifier)?.airplay},
                            'playing'
                        );
                        const parsed_stdout = Object.fromEntries(
                            stdout.map(n => {
                                n = n.trim(); 
                                const match = n.match(/^(.*?):(.*)$/); 
                                return match ? [match[1].trim(), match[2].trim()] : null;
                            })
                        );
                        console.log('parsed_stdout', parsed_stdout);

                        // "111/222s (50%)"   or   "111s"
                        const position_mat = parsed_stdout.Position?.match(/^(.*?)(\/(.*?))?s/) ?? [-1, -1, -1, -1];
                        const position_now = parseInt( position_mat[1] );
                        const position_total = position_mat[3] ? parseInt( position_mat[3] ) : -1;
                        const repeat = {On:true, Off:false}[parsed_stdout.Repeat];
                        const shuffle = {On:true, Off:false}[parsed_stdout.Shuffle];
                        const media_type = parsed_stdout['Media type'];
                        const device_state = parsed_stdout['Device state'];

                        const status = {
                            position: [position_now, position_total],
                            repeat,
                            shuffle,
                            media_type,
                            device_state,
                        };

                        device = {...device, status};
                    }
                    catch (error) {
                        console.warn('failed while querying now-playing, error was :', error);
                        device = {...device, status: null};
                    }

                    // finally append it to this.devices
                    this._devices[d.identifier] = device;
                    console.log("[DEVICE] ready", device);
                    this._pub(
                        TOPIC_PUBLISH_PATTERN.replace('{ID}', nickname ?? device.identifier), 
                        device);
                }
            }
            console.log('[SCAN] took', Math.round((Date.now() - start_scan_time)/1000),'seconds');
            return {devices: this._devices};
        }
        catch (scan_error) {
            console.log('[SCAN] failed, but it took', Math.round((Date.now() - start_scan_time)/1000),'seconds');
            console.warn('failed to scan for devices', scan_error);
            return {scan_error};
        }
    }

    get_device_def(identifier) {
        return this._device_defs.find(dd => dd?.identifier.toLowerCase().trim() === identifier.toLowerCase().trim());
    }

    get_credentials(identifier) {
        return this.get_device_def(identifier)?.credentials;
    }

    start_scanning() {
        this._scan_timer = setInterval(async () => {
            if(this._is_scanning) {
                console.warn('[SCAN] abort because another scan is in progress');
                return;
            }
            await this.scan();
            this._is_scanning = false;
        }, this._scan_interval * 1000);
    }

    stop_scanning() {
        clearInterval(this._scan_timer);
        this._scan_timer = null;
    }

    start_dir_publishing() {
        this._dir_timer = setInterval(async () => {
            await this.dir();
        }, this._dir_interval * 1000);
    }

    stop_dir_publishing() {
        clearInterval(this._dir_timer);
        this._dir_timer = null;
    }    
    dir() {
        const dir = Object.keys(this._directory);
        return this._pub(TOPIC_PUBLISH_PATTERN.replace('{ID}', '__dir__'), dir);
    }

    stop(opts) {
        opts = Object.assign({force: false}, opts);
        console.log('client closing :', JSON.stringify(opts));
        return new Promise(resolve => {
            this.stop_scanning();
            this.stop_dir_publishing();
            //stop mqtt client
            if (this.connected) {
                this._client.end(opts.force, opts, ()=>{
                    console.log('client closed');
                    this._client = null;
                    resolve();
                });
            }
            else {
                resolve({not_connected:true});
            }
        });
    }

    /**
     * enqueues to publish one MQTT message ; resolves when the message is published
     * @param {string} topic
     * @param {object} body
     * @param {object} opts see : https://github.com/mqttjs/MQTT.js#publish
     * @return {Promise} resolves once the message is published
     */
    _pub(topic, body, opts) {
        return new Promise(async (finally_resolve, finally_reject) => {
            await this._connect();
            // see : https://github.com/Bartozzz/queue-promise
            const message = Buffer.from(JSON.stringify(body, 'utf8'));
            const task = () => new Promise((resolve, reject) => {
                console.log('[_pub] publishing :', topic);
                this._client.publish( topic, 
                    message, 
                    opts, 
                    error => {
                        if (error) {
                            const rej = {error};
                            reject(rej);
                            finally_reject(rej);
                        }
                        else {
                            resolve();
                            finally_resolve();
                        }
                    }
                );
            });
            this._q.enqueue(task);
        });
    }

    get connected() {
        return this._client?.connected;
    }

    _connect() {
        if (this.connected) return Promise.resolve({already_connected:true});
        return new Promise(resolve => {
            // see : https://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener
            const connect_opts = {
                protocol: 'mqtts', 
                host: this._host,
                port: this._port,
                key: this._key,
                cert: this._cert,
                ca: this._ca,
                rejectUnauthorized: true, 
                username: this._username,
                password: this._password,
            };
            this._client = mqtt.connect(connect_opts);
            this._client.on('connect', () => {
                console.log('[mqtt client] connected');
                // once we are connected, we subscribe to messages
                const topic = TOPIC_SUBSCRIBE_PATTERN.replace('{ID}', '+');
                this._client.subscribe(topic, err => {
                    console.log('[mqtt client] subscribe', topic,' ; err=', err);
                    if (err) {
                        return reject(new Error('failed to subscribe to : ' + topic));
                    }
                    else {
                        return resolve();
                    }
                });
                // topic callback
                this._client.on('message', (topic, message) => {
                    this._on_message(topic, message.toString('utf8'));
                });
                resolve();
            });
        });
    }

    _on_message(topic, message) {
        console.log('[message] received', topic, message);
        const topic_match = topic.match(new RegExp('^' + TOPIC_SUBSCRIBE_PATTERN.replace('{ID}', '(.*?)').replace('+', '(.*)') + '$'));
        if (! topic_match) {
            console.warn('ERROR : failed to parse topic :', topic);
            return;
        }
        const user_ident = topic_match[1];
        const set_what = topic_match[2];

        // user_ident might be a "name" , "nickname" or "identifier" 
        let identifier;
        if (user_ident in this._devices) {
            identifier = user_ident;
        }
        else {
            const found = Object.values(this._devices).find(d => d?.name === user_ident);
            identifier = found?.identifier;
            if (! identifier) {
                const found = Object.values(this._devices).find(d => d?.nickname === user_ident);
                identifier = found?.identifier;
                if (! identifier) {
                    console.warn('ERROR : unknown user_ident, discarding message :', topic);
                    return;
                }
            }
        }
        switch (set_what) {
            case 'do':
                const cmd = message.trim();
                this.execute_simple_command(identifier, cmd, topic);
                break;
            case 'open':
                const open_what = message.trim();
                this.execute_open(identifier, open_what, topic);
        }
    }

    async execute_open(identifier, open_what, topic, opts={}) {
        opts = Object.assign({allow_dir:true}, opts);

        // possible values for open_what:
        // - "youtube:xxxx"
        // - https://...
        //      - youtube or youtu.be domain --> youtube-dl
        //      - other domains --> play_url
        // - dir identifier
        // - app identifier
        let youtube_ident;
        const parsed_url = URL.parse(open_what);
        if (parsed_url.protocol) {
            if (['www.youtube.com', 'youtube.com', 'youtu.be'].indexOf(parsed_url.hostname) >= 0) {
                return await this.open_youtube(identifier, open_what, topic);
            }
            else {
                return await this.play_url(identifier, open_what, topic);
            }
        }
        else if (!!( youtube_ident = open_what.match(/^youtube:(.*)$/)?.[1] )) { 
            return await this.open_youtube(identifier, youtube_ident, topic);
        }
        if (opts.allow_dir && open_what in this._directory) {
            return await this.execute_open(identifier, this._directory[open_what], topic, 
                {allow_dir: false}); // prevent circular dir reference
        }
        else {
            // assume it's app identifier
            return await this.execute_launch_app(identifier, open_what, topic);
        }
    }

    async open_youtube(identifier, youtube_url, topic) {
        if (! this._youtube_dl_venv_dir) {
            console.warn('[open_youtube] FAIL because youtube-dl not configured');
            this._pub_result(topic, {youtube:youtube_url, 'no-youtube-dl-configured': 1});
            return;
        }

        // get the hash "#..." of the URL excluding the hash mark
        const hash = (URL.parse(youtube_url)?.hash || '#').substr(1).toLowerCase().trim();
        const requested_playlist_idx = hash === 'random' ? 'random'
            : hash.match(/^[0-9]+$/) ? parseInt(hash)
            : 0;

        let media_url;
        try{ 
            media_url = await get_media_url(this._youtube_dl_venv_dir, youtube_url);
            if (Array.isArray(media_url)) {
                console.warn('[YOUTUBE] multiple URLs returned');
                if (requested_playlist_idx === 'random') {
                    const idx = Math.round(Math.random() * (media_url.length - 1));
                    console.warn('[YOUTUBE] random idx :', idx);
                    media_url = media_url[ idx ];
                }
                else if (requested_playlist_idx < 0) {
                    // -1 means last 
                    // -2 means second last , etc
                    const idx = media_url.length + requested_playlist_idx;
                    media_url = media_url[ idx ];
                    console.warn('[YOUTUBE] requested idx :', idx);
                }
                else {
                    console.warn('[YOUTUBE] requested idx :', requested_playlist_idx);
                    media_url = media_url[requested_playlist_idx];
                }
                if (! media_url) {
                    console.warn(`[YOUTUBE] error: no media URL at index ${requested_playlist_idx}`);
                    return this._pub_result(topic, {youtube:youtube_url, 'playlist-index-error': 1});
                }
            }
        }
        catch(e) {
            console.warn('[open_youtube] FAIL because youtube-dl returned error', e);
            return this._pub_result(topic, {youtube:youtube_url, 'youtube-dl-error': 1});
        }
        return this.play_url(identifier, media_url, topic);
    }

    async play_url(identifier, media_url, topic) {
        try {
            const {code} = await run_atvremote( this._venv_dir, identifier, 
                {airplay: this.get_credentials(identifier)?.airplay},
                `play_url=${media_url}`
            );
            this._pub_result(topic, {url: media_url, [code === 0 ? 'ok':'failed']: 1});
        }
        catch (e) {
            const {code} = e;
            console.warn('[play_url] FAIL because atvremote returned error', e);
            this._pub_result(topic, {url: media_url, error:1});
        }
    }

    async execute_launch_app(identifier, app_ident, topic) {
        let final_app_ident;
        const apps = this._devices[identifier]?.apps;
        if (apps) {
            if (app_ident in apps) {
                final_app_ident = app_ident;
            }

            else {
                // guess app ident from first partial match
                final_app_ident = Object.keys(apps).find(a => a.toLowerCase().indexOf(app_ident.toLowerCase()) >= 0);
                if (! final_app_ident) {
                    final_app_ident = Object.entries(apps).find(pair => pair[1].toLowerCase().indexOf(app_ident.toLowerCase()) >= 0)?.[0]
                    if (! final_app_ident) {
                        console.warn('launch preflight failed; unknown app_ident', app_ident);
                        this._pub_result(topic, {app:app_ident, 'invalid-app-ident': 1});
                        return;
                    }
                }
                console.warn(`guessed app identifier ${app_ident} ==> ${final_app_ident}`);
            }
        }
        else {
            console.warn('app list unknown; unable to determine if app_ident is legit; proceeding anyway');
        }

        try {
            const {code} = await run_atvremote( this._venv_dir, identifier, 
                {companion: this.get_credentials(identifier)?.companion},
                `launch_app=${final_app_ident}`
            );
            this._pub_result(topic, {app: app_ident, [code === 0 ? 'ok':'failed']: 1});
        }
        catch (e) {
            const {code} = e;
            console.warn('[open_youtube] FAIL because atvremote returned error', e);
            this._pub_result(topic, {app: app_ident, error:1});
        }
    }

    async execute_simple_command(identifier, cmd, topic) {
        console.log("[execute_simple_command]", cmd);
        if(['turn_on', 'turn_off', 'menu', 'up', 'down', 'left', 'right', 'select', 'play_pause', 'home'].indexOf(cmd) >= 0) {
            const {code} = await run_atvremote( this._venv_dir, identifier, 
                {companion: this.get_credentials(identifier)?.companion},
                cmd
            );
            this._pub_result(topic, {do: cmd, [code === 0 ? 'ok':'failed']: 1});
        }
        else {
            // invalid command
            this._pub_result(topic, {do: cmd, 'invalid-command': 1});
        }

    }

    _pub_result(topic, res) {
        return this._pub(`${topic}/result`, {...res, __when__: Date.now() });
    }
}

module.exports = Pyatv2mqtt;
