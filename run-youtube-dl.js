#!/usr/bin/env node

const execute = require('./execute');
const path = require('path');
const os = require('os');
const {mkdtemp, writeFile, rm, readFile} = require('fs').promises;


async function run_youtube_dl(venv_dir, args) {
    const temp_dir = await mkdtemp(path.join(os.tmpdir(), 'run-ytdl-'));
    const clean_up = async () => {
        console.log("clean up :", temp_dir);
        await rm(temp_dir, {recursive: true, force: true});
    };
    const script_path = `${temp_dir}/run-ytdl.sh`;
    await writeFile(script_path, `#!/bin/bash
source "${venv_dir}"/bin/activate
"${venv_dir}"/bin/yt-dlp ${args.map(JSON.stringify).join(' ')}
exit $?
'`, 'utf8');

    try {
        const {code, stdout, stderr} = await execute('bash', {
            args: [script_path],
            on_stderr: line => console.log('[E]', line),
        });

        console.warn(`successfully run youtube-dl; exit code :`, code);
        await clean_up();

        return {code, stdout, stderr};
    }
    catch (e) {
        await clean_up();

        // e.g. exit code > 0
        const {code, stdout, stderr} = e;
        console.warn('failed to run youtube-dl; exit code :', code);
        throw {code, stdout, stderr, error:1};
    }
}

async function get_media_url(venv_dir, youtube_url) {
    try { 
        const {stdout} = await run_youtube_dl(venv_dir, ['-g', '-f', 'best', youtube_url]);
        if (! stdout) {
            throw ('no stdout collected from run_youtube_dl');
        }
        if (stdout.length > 1) {
            const final_urls = stdout.map(s => s.trim().replace(/,/g, '%2C'));
            console.log(`resolved youtube media URL: ${youtube_url} ==> ${final_urls.length} URLs`);
            return final_urls;
        }
        else {
            const final_url = stdout.map(s => s.trim().replace(/,/g, '%2C'))[0];
            console.log(`resolved youtube media URL: ${youtube_url} ==> ${final_url.length} URLs`);
            return final_url;
        }
    }
    catch (error) {
        console.warn('failed to run youtube-dl', error);
        throw error;
    }
}

module.exports = {run_youtube_dl, get_media_url};

