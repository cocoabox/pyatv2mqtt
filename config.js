#!/usr/bin/env node

const JSON5 = require('json5');
const path = require('path');
const fs = require('fs');

function parse_conf_str(str, base_dir) {
    const parsed = str.match(/^(base64|file):(.*)$/);
    if (parsed) {
        if (parsed[1] === 'base64') {
            return Buffer.from(parsed[2], 'base64');
        }
        else if (parsed[1] === 'file') {
            const file_full_path = path.resolve(base_dir, parsed[2]);
            return fs.readFileSync(file_full_path, 'utf8');
        }
        else {
            return;
        }
    }
    else {
        return str;
    }
}

class Config {
    static from_path(conf_path) {
        const base_dir = path.dirname(conf_path);
        const parsed = JSON5.parse(fs.readFileSync(conf_path, 'utf8'));
        return new Config(parsed, base_dir);
    }

    constructor(parsed_conf_obj, base_dir) {
        this._conf = parsed_conf_obj;
        this._base_dir = base_dir;
    }

    get mqtt() {
        return {
            host: this.body.mqtt?.host,
            port: this.body.mqtt?.port,
            cert: parse_conf_str(this.body.mqtt?.cert, this._base_dir),
            key: parse_conf_str(this.body.mqtt?.key, this._base_dir),
            ca: parse_conf_str(this.body.mqtt?.ca, this._base_dir),
            username: this.body.mqtt?.username,
            password: this.body.mqtt?.password,
        };
    }

    get body() {
        return this._conf || {};
    }

    parse_key(key) {
        const str = key.split('.').reduce((o,i)=> o[i], this._conf);
        return this.parse_str(str);
    }

    parse_str(str_content) {
        return parse_conf_str(str_content, this._base_dir);
    }

}

module.exports = Config;
