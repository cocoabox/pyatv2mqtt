#!/usr/bin/env node

const {readFile} = require('fs').promises;
const path = require('path');
const Pyatv2mqtt = require('./pyatv2mqtt');
const Config = require('./config');

const conf = Config.from_path(`${__dirname}/config.json5`);
const dir = Config.from_path(`${__dirname}/dir.json5`);

const mqtt_conf = conf.mqtt;

let client_instance;

process.on('SIGTERM', () => {
    console.log('exiting');
    if (client_instance) {
        client_instance.stop().then(()=>{
            process.exit(0);
        });
    }
    else {
        process.exit(0);
    }
});

client_instance = new Pyatv2mqtt(
    mqtt_conf.key,
    mqtt_conf.cert,
    mqtt_conf.ca,
    mqtt_conf.host,
    mqtt_conf.port,
    mqtt_conf.username,
    mqtt_conf.password,
    conf.body.devices,
    path.resolve(__dirname, conf.parse_key('pyatv_venv_dir')),
    {
        directory: dir.body,
        yt_dlp_venv_dir: path.resolve(__dirname, conf.parse_key('yt_dlp_venv_dir')),
        niconico_venv_dir: path.resolve(__dirname, conf.parse_key('niconico_venv_dir')),
        scan_interval: conf.body.scan_interval * 60,
        dir_interval: conf.body.dir_interval * 60,
    }
);


