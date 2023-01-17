import { Argv, CommandModule } from 'yargs';
import logger from '../common/logger';
import { AdbTcpTransport } from './AdbTcpTransport';
import { ServerConnection } from './ServerConnection';
import { RemoteAdbDevice, UsbDeviceManager } from './UsbDeviceManager';

export const commandDevices = {
    command: "devices",
    describe: "List locally connected devices",
    builder: (yargs: Argv) => {
        return yargs
            .usage("$0 devices")
    },
    handler: (args: {}) => {
        if (!UsbDeviceManager.isSupported()) {
            logger.error("USB devices are not supported");
            return;
        }

        UsbDeviceManager.getDevices().then((devices) => {
            logger.log("List of devices attached");
            devices.forEach((d) => {
                logger.log(`${d.serial}\t${d.name}`);
            });
            process.exit(0);
        });
    }
} as CommandModule;

export const commandConnect = {
    command: "connect <server>",
    describe: "Connect locally connected device to server",
    builder: (yargs: Argv) => {
        return yargs
            .usage("$0 connect [-s SERIAL|HOST:PORT] <server>")
            .option("serial", {
                alias: "s",
                describe: "use device with given serial or host:port",
                nargs: 1,
                string: true,
            })
            .group(["s"], "Device Selection:")
            .option("password", {
                alias: "p",
                describe: "password to use if required by the server",
                nargs: 1,
                string: true,
            })
            .group(["p"], "Server options:")
            .positional("server", {
                describe: "URL of the server (e.g. http://192.168.1.10:3000)",
                string: true,
                demandOption: "true",
            })
            .example("$0 connect http://remote-host:3000 -s USBSERIAL", "Connect device USBSERIAL via usb")
            .example("$0 connect http://remote-host:3000 -s 127.0.0.1:5557", "Connect device on 127.0.0.1:5555 via tcp")
    },
    handler: (args: {server?: string, serial?: string}) => {
        connect(args);
    }
} as CommandModule;

async function connect(args: {server?: string, serial?: string, password?: string}) {
    let device: RemoteAdbDevice;

    // First try to see if this is a tcp device
    device = await getTcpDevice(args.serial);

    // Find usb device with serial or exit
    device = device || await ensureUsbDevice(args.serial);

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
        if (!args.password) {
            logger.error("Server requires authentication. Please provide a password with --password.");
            process.exit(4);
        }

        logger.log("Server requires authentication. Trying to login.")
        try {
            await serverConnection.login(args.password);
        }
        catch (e) {
            logger.error(`Authentication failed: ${e.message}`);
            process.exit(5);
        }
        logger.log("Authentication successful");
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
    })
}

async function ensureUsbDevice(serial: string): Promise<RemoteAdbDevice> {
    if (!UsbDeviceManager.isSupported()) {
        logger.error("USB devices are not supported");
        process.exit(1);
    }

    let devices = await UsbDeviceManager.getDevices();

    let device: RemoteAdbDevice;
    if (serial) {
        let filtered = devices.filter((d) => {
            return d.serial == serial
        });

        if (!filtered.length) {
            logger.error(`Could not find connected device with serial "${serial}"`);
            process.exit(1);
        }

        device = filtered[0];
    }
    else if (devices.length > 1) {
        logger.error("More than one devices connected. Please specify a device with --serial.");
        process.exit(1);
    }
    else if (!devices.length) {
        logger.error("No USB devices connected");
        process.exit(1);
    }
    else {
        device = devices[0];
    }

    return device;
}

async function getTcpDevice(serial: string): Promise<RemoteAdbDevice|undefined> {
    try {
        const url = new URL(`tcp://${serial}`);

        if (!url.hostname || !url.port || Number.isNaN(Number(url.port))
            || url.pathname || url.search || url.hash || url.username || url.password)
        {
            return;
        }

        return new RemoteAdbDevice(new AdbTcpTransport(url.hostname, Number(url.port)));
    }
    catch {
        return;
    }
}
