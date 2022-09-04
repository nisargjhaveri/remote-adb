import { Argv, CommandModule } from 'yargs';
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
            console.error("USB devices are not supported");
            return;
        }

        UsbDeviceManager.getDevices().then((devices) => {
            console.log("List of devices attached");
            devices.forEach((d) => {
                console.log(`${d.serial}\t${d.name}`);
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
            .usage("$0 connect [-s SERIAL] <server>")
            .option("serial", {
                alias: "s",
                describe: "use device with given serial",
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
    },
    handler: (args: {server?: string, serial?: string}) => {
        connect(args);
    }
} as CommandModule;

async function connect(args: {server?: string, serial?: string, password?: string}) {
    if (!UsbDeviceManager.isSupported()) {
        console.error("USB devices are not supported");
        return;
    }

    let devices = await UsbDeviceManager.getDevices();

    let device: RemoteAdbDevice;
    if (args.serial) {
        let filtered = devices.filter((d) => {
            return d.serial == args.serial
        });

        if (!filtered.length) {
            console.error(`Could not find connected device with serial ${args.serial}`);
            process.exit(1);
        }

        device = filtered[0];
    }
    else if (devices.length > 1) {
        console.error("More than one devices connected. Please specify a device with --serial.");
        process.exit(1);
    }
    else if (!devices.length) {
        console.error("No USB devices connected");
        process.exit(1);
    }
    else {
        device = devices[0];
    }

    console.log(`Connecting device "${device.name} (${device.serial})"`)

    const serverConnection = new ServerConnection(args.server);

    const status = await serverConnection.getServerStatus();

    if (status._error) {
        console.error(`Cannot get server status: ${status._error}`);
        process.exit(3);
    }
    else if (status.loginSupported && status.loginRequired) {
        if (!args.password) {
            console.error("Server requires authentication. Please provide a password with --password.");
            process.exit(4);
        }

        console.log("Server requires authentication. Trying to login.")
        try {
            await serverConnection.login(args.password);
        }
        catch (e) {
            console.error(`Authentication failed: ${e.message}`);
            process.exit(5);
        }
        console.log("Authentication successful");
    }

    device.on("disconnected", () => {
        process.exit(0);
    })

    try {
        await device.connect(serverConnection);
    }
    catch (e: any) {
        console.error(`Unable to connect device: ${e.message}`);
        process.exit(2);
    }

    process.on("SIGINT", async () => {
        console.log("Disconnecting device")
        await device.disconnect();
        process.exit(0);
    })
}