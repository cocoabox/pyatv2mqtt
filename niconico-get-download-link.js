#!/usr/bin/env node

const execute = require('./execute');
const {mkdtemp, writeFile, rm, readFile} = require('fs').promises;
const path = require('path');
const os = require('os');
const URL = require('url');

async function niconico_expand_mylist(venv_dir, mylist_url) {
    const temp_dir = await mkdtemp(path.join(os.tmpdir(), 'run-niconico-'));
    const clean_up = async () => {
        console.log("clean up :", temp_dir);
        await rm(temp_dir, {recursive: true, force: true});
    };

    const script_path = `${temp_dir}/run-niconico.sh`;
    await writeFile(script_path, `#!/bin/bash
source "${venv_dir}"/bin/activate

python3 - << EOF
from niconico import NicoNico
client = NicoNico()
for mylist in client.video.get_mylist("${mylist_url}"):
    for item in mylist.items:
         print(item.video.url)

EOF

exit $?
'`, 'utf8');
    try {
        const {code, stdout, stderr} = await execute('bash', {
            args: [script_path],
            on_stderr: line => console.log('[E]', line),
        });
        await clean_up();

        const niconico_urls = stdout.filter(line=> 
            [
                'www.nicovideo.jp',
                // any other domains that can be in MyLists
            ].includes( URL.parse(line)?.hostname )
        ).filter( (value, index, self) => self.indexOf(value) === index );

        if (niconico_urls.length > 0) {
            console.log(`got ${niconico_urls.length} niconico links`); 
            return niconico_urls;
        }
        else {
            console.warn('did not get any links; not mylist URL ??');
            throw {error:'could-not-get-link-from-stdout'};
        }
    }
    catch (e) {
        await clean_up();
        throw {get_download_link_error: e};
    }
}

async function niconico_get_download_link(venv_dir, niconico_url) {
    const temp_dir = await mkdtemp(path.join(os.tmpdir(), 'run-niconico-'));
    const clean_up = async () => {
        console.log("clean up :", temp_dir);
        await rm(temp_dir, {recursive: true, force: true});
    };

    const script_path = `${temp_dir}/run-niconico.sh`;
    await writeFile(script_path, `#!/bin/bash
source "${venv_dir}"/bin/activate

python3 - << EOF
from niconico import NicoNico
client = NicoNico()
with client.video.get_video("${niconico_url}") as video:
    print( video.download_link )
EOF

exit $?
'`, 'utf8');
    try {
        const {code, stdout, stderr} = await execute('bash', {
            args: [script_path],
            on_stderr: line => console.log('[E]', line),
        });
        await clean_up();

        const download_link = stdout.join('\n').trim();
        if (download_link) {
            console.log('got download link :', download_link);
            return download_link;
        }
        else {
            console.warn('video.download_link did not work');
            throw {error:'could-not-get-link-from-stdout'};
        }
    }
    catch (e) {
        await clean_up();
        throw {get_download_link_error: e};
    }

}

module.exports = {niconico_get_download_link, niconico_expand_mylist};

