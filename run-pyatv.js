#!/usr/bin/env node

const execute = require('./execute');
const {mkdtemp, writeFile, rm, readFile} = require('fs').promises;
const path = require('path');
const os = require('os');

async function run_pyatv(venv_dir, util_name, id, cred, args, parse_results=false) {
    if (! Array.isArray(args)) args = [args];
   
    // cred = {companion: XXXX}   or  {airplay: XXXX}
    const obj0 = cred ? Object.entries(cred)?.[0] : null;
    const protocol = obj0?.[0];
    const cred_str = obj0?.[1];

    args = [].concat(
        (!! id) && (!! protocol) 
        ? ['--id', id, '--protocol', protocol, `--${protocol}-credentials`, cred_str]
        : [], args);

    console.warn('[run]', util_name, JSON.stringify(args));

    const temp_dir = await mkdtemp(path.join(os.tmpdir(), 'run-pyatv-'));
    const clean_up = async () => {
        console.log("clean up :", temp_dir);
        await rm(temp_dir, {recursive: true, force: true});
    };

    const script_path = `${temp_dir}/run-pyatv.sh`;
    await writeFile(script_path, `#!/bin/bash
source "${venv_dir}"/bin/activate
"${venv_dir}"/bin/${util_name} ${args.map(JSON.stringify).join(' ')}
exit $?
'`, 'utf8');

    // console.log('SCRIPT=', await readFile(script_path,'utf8'));

    try {
        const {code, stdout, stderr} = await execute('bash', {
            args: [script_path],
            on_stderr: line => console.log('[E]', line),
        });
        console.warn(`successfully run ${util_name}; exit code :`, code);
        await clean_up();

        try {
            if (! parse_results) {
                return {code, stdout, stderr};
            }
            const out = JSON.parse(stdout);
            if (out.error || out.exception) {
                throw {app_error: {error: out.error, exception: out.exception}};
            }
            return {stdout, stderr, out};
        }
        catch (e) {
            if (e instanceof SyntaxError) {
                throw {stdout, stderr, parse_error: e};
            }
            else if (e.app_error) {
                throw {stdout, stderr, app_error: e.app_error};
            }
            else {
                throw {stdout, stderr, unknown_error: e};
            }
        }
                
        return {stdout, stderr};
    }
    catch (e) {
        await clean_up();

        // e.g. exit code > 0
        const {code, stdout, stderr} = e;
        console.warn('failed to run atvremote; exit code :', code);
        throw {code, stdout, stderr, error:1};
    }
}

function run_atvscript(venv_dir, id, cred, args) {
    return run_pyatv(venv_dir, 'atvscript', id, cred, args, true);
}

function run_atvremote(venv_dir, id, cred, args) {
    return run_pyatv(venv_dir, 'atvremote', id, cred, args, false);
}

module.exports = {
    run_atvremote,
    run_atvscript,
};
