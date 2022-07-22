const execute = require('./execute');

async function detect_4xx_using_curl(link) {
    // curl   -s -o /dev/null -w "%{http_code}"  https://www.nicovideo.jp/watch/sm7717148
    try {
        const {code, stdout, stderr} = await execute('curl', {
            on_stderr: line => console.log('[E]', line),
            args: [
                '-s',
                '-o',
                '/dev/null',
                '-w',
                '%{http_code}',
                link
            ],
        });
        const status_code = parseInt(
            stdout.join("\n").trim()
        );

        if (status_code >= 400 && status_code < 500) {
            console.warn(`NG! ${link} got status ${status_code}`);
            return false;
        }
        else {
            console.warn(`OK! ${link} got status ${status_code}`);
            return true;
        }
    }
    catch(error) {
        console.warn('failed to call curl to detect if link is 4xx', error);
        throw {curl_execute_error: error};
    }

}

module.exports = { detect_4xx_using_curl };

