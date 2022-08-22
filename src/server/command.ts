import * as fs from 'fs';
import { Argv } from 'yargs';

import { Server } from './server';


export const command = "server"
export const describe = "Start in server mode"

export function builder(yargs: Argv) {
    return yargs
        .usage('$0 server [--port PORT] [--key server.key --cert server.crt]')
        .option('port', {
            alias: 'p',
            describe: 'port to run the server on',
            default: 3000,
            nargs: 1,
            type: 'number',
            group: 'Server Options:'
        })
        .option('key', {
            describe: 'file containing RSA private key',
            requiresArg: true
        })
        .option('cert', {
            describe: 'file containing SSL certificate chain',
            requiresArg: true
        })
        .implies({
            'key': 'cert',
            'cert': 'key'
        })
        .normalize(['key', 'cert'])
        .check((argv) => {
            if (argv.key) {
                fs.accessSync(argv.key, fs.constants.R_OK);
            }
            if (argv.cert) {
                fs.accessSync(argv.cert, fs.constants.R_OK);
            }
            return true;
        })
        .group(['key', 'cert'], "HTTPS Options:")
        .strict()
}

export function handler(args: {port: number, key: string, cert: string}) {
    const useHttps = !!(args.key && args.cert);
    const httpsOptions = useHttps ? {
        key: fs.readFileSync(args.key),
        cert: fs.readFileSync(args.cert)
    } : undefined;

    new Server(args.port, httpsOptions).start();
}
