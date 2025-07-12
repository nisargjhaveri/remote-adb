import * as net from 'net';
import * as fs from 'fs';
import { Argv, CommandModule } from 'yargs';
import logger from '../common/logger';
import { commandServer } from '../server/command';
import { Server } from '../server';
import { ServerConnection, RemoteAdbDevice, TcpDeviceManager } from '../client';
import { BenchmarkDevice } from './device';

export const commandBenchmark = {
    command: "benchmark",
    describe: "Benchmark remote-adb connection",
    builder: (yargs: Argv) => {
        return yargs
            .usage("$0 benchmark")
            .command({
                command: "server",
                describe: "Start a benchmark server",
                builder: commandServer.builder,
                handler: (args: {port?: number, host?: string, key?: string, cert?: string, password?: string}) => {
                    benchmarkServer(args);
                }
            } as CommandModule)
            .command({
                command: "connect <server>",
                describe: "Connect to a benchmark server",
                builder: (yargs: Argv) => {
                    return yargs
                        .usage("$0 benchmark connect <server>")
                        .positional("server", {
                            describe: "URL of the server (e.g. http://192.168.1.10:3000)",
                            string: true,
                            demandOption: "true",
                        })
                },
                handler: (args: {server?: string}) => {
                    benchmarkConnect(args);
                }
            } as CommandModule)
    },
    handler: (args: {server?: string, serial?: string}) => {
        logger.log(args);
        // connect(args);
    }
} as CommandModule;


async function benchmarkServer(args: {port?: number, host?: string, key?: string, cert?: string, password?: string}) {
    const useHttps = !!(args.key && args.cert);
    const httpsOptions = useHttps ? {
        key: fs.readFileSync(args.key),
        cert: fs.readFileSync(args.cert)
    } : undefined;

    const listenOptions = { port: args.port, host: args.host };

    if (args.password) {
        logger.error("Benchmark server does not support password authentication yet.");
        process.exit(1);
    }

    new Server(listenOptions, httpsOptions, {
        deviceCallbacks: {
            onDeviceConnected: (port) => {
                logger.log(port, `Benchmark device connected`);
            },
            onDeviceDisconnected: (port) => {
                logger.log(port, `Benchmark device disconnected`);
            }
        }
    }).start();
}

async function benchmarkConnect(args: {server?: string}) {
    const benchmarkDevice = await BenchmarkDevice.create();

    const device: RemoteAdbDevice = await TcpDeviceManager.createDevice(benchmarkDevice.serial);

    // We should not reach here, just in case.
    if (!device) {
        process.exit(1);
    }

    logger.log(`Preparing to connect device "${device.name} (${device.serial})"`);

    const serverConnection = new ServerConnection(args.server);

    logger.log("Connecting to server for status");
    const status = await serverConnection.getServerStatus();

    if (status._error) {
        logger.error(`Cannot get server status: ${status._error}`);
        process.exit(3);
    }
    else if (status.loginSupported && status.loginRequired) {
        logger.error("Benchmark does not support password authentication yet.");
        process.exit(1);
    }

    logger.log(`Connecting device "${device.name} (${device.serial})"`);

    device.on("disconnected", () => {
        process.exit(0);
    })

    try {
        await device.connect(serverConnection);
    }
    catch (e: any) {
        logger.error(`Unable to connect device: ${e.message}`);
        process.exit(2);
    }

    process.on("SIGINT", async () => {
        logger.log("Disconnecting device");
        await device.disconnect();
        process.exit(0);
    });

    logger.log(`Connected, Starting benchmark...`);

    benchmarkDevice.sendSmallMessages(10);
}
