const http = require('http');

async function inspect(path) {
    return new Promise((resolve) => {
        const options = { hostname: 'localhost', port: 3000, path: path, method: 'GET' };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`\n--- ${path} ---`);
                    if (json.length > 0) {
                        console.log(JSON.stringify(json[0], null, 2));
                    } else {
                        console.log('Empty array');
                    }
                } catch (e) {
                    console.log(`\n--- ${path} (ERROR) ---`);
                    console.log(data.substring(0, 100));
                }
                resolve();
            });
        });
        req.on('error', (e) => { resolve(); });
        req.end();
    });
}

async function run() {
    const paths = [
        '/api/admin/clients',
        '/api/admin/savings',
        '/api/admin/loans',
        '/api/admin/disbursed-loans',
        '/api/admin/payments'
    ];
    for (const p of paths) await inspect(p);
}

run();
