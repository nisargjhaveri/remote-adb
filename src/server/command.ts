import * as fs from 'fs';
import { Argv, CommandModule } from 'yargs';

import { Server } from './server';

export const commandServer = {
    command: "server",
    describe: "Start in server mode",
    builder: (yargs: Argv) => {
        return yargs
            .usage('$0 server [--port PORT] [--key server.key --cert server.crt]')
            .option('port', {
                alias: 'p',
                describe: 'port to run the server on',
                default: 3000,
                nargs: 1,
                type: 'number',
            })
            .option('host', {
                describe: 'host to bind the server to',
                nargs: 1,
                type: 'string',
            })
            .option('password', {
                describe: 'specify password required to connect',
                type: 'string',
                nargs: 1
            })
            .group(['port', 'host', 'password'], "Server Options:")
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
    },
    handler: (args: {port?: number, host?: string, key?: string, cert?: string, password?: string}) => {
        const useHttps = !!(args.key && args.cert);
        const httpsOptions = useHttps ? {
            key: fs.readFileSync(args.key),
            cert: fs.readFileSync(args.cert)
        } : undefined;

        const listenOptions = { port: args.port, host: args.host };

        new Server(listenOptions, httpsOptions, {
            password: args.password
        }).start();
    }
} as CommandModule;
