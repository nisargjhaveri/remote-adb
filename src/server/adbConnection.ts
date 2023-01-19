import { AdbClient } from '../common/adbClient';
import logger from '../common/logger';

let adbConnection: AdbClient|undefined;
let connectedDevices: Set<Number> = new Set();

async function adbMonitorDisconnected() {
    if (!adbConnection) { return; }

    adbConnection = undefined;
    logger.log("adb server disconnected");
}

async function adbMonitorConnected(adbClient: AdbClient) {
    adbConnection = adbClient;
    logger.log("adb server connected");

    try {
        await adbClient.request("host:track-devices-l");
        logger.log("track-devices", "started");

        addAllAdbDevices();

        let message;
        do {
            message = await adbClient.readMessage();
            message.trim().split("\n")
                .map(m => m.trim())
                .map(m => logger.log("track-devices", m));
        }
        while (message != null)
    }
    catch (e) {
        logger.log("track-devices", "error", e.message);
    }
}

async function addAllAdbDevices() {
    if (!connectedDevices.size) return;
    logger.log("try adding all previous devices");

    connectedDevices.forEach((port) => {
        adbConnect(port);
    })
}

export async function monitorAdbServer() {
    logger.log("Monitoring adb server");
    do {
        let timer = new Promise((resolve, reject) => {
            setTimeout(resolve, 1000);
        });

        try {
            const adbClient = new AdbClient();
            const socket = await adbClient.connect();

            adbMonitorConnected(adbClient);

            // Wait for the socket to close
            await new Promise<void>((resolve, reject) => {
                socket.on("error", (e) => {
                    // Do nothing
                });
    
                socket.on("close", (hadError) => {
                    adbMonitorDisconnected();
                    resolve();
                });
            });
        }
        catch (e) {
            // Do nothing
        }

        await timer;
    }
    while(true);
}

export async function addAdbDevice(port: Number) {
    if (adbConnection) {
        adbConnect(port);
    }

    connectedDevices.add(port);
}

export async function removeAdbDevice(port: Number) {
    if (adbConnection) {
        adbConnect(port, true /* disconnect */);
    }

    connectedDevices.delete(port);
}


function adbMessage(message: string) {
    const length = message.length;
    return `000${length.toString(16)}`.slice(-4) + message;
}

async function adbConnect(port: Number, disconnect?: boolean) {
    logger.log(port, disconnect ? "disconnecting device from adb" : "connecting device to adb");

    try {
        const adbClient = new AdbClient();

        await adbClient.connect();
        await adbClient.request(`host:${disconnect ? "disconnect" : "connect"}:127.0.0.1:${port}`);

        const message = await adbClient.readMessage();

        logger.log(port, message);
    }
    catch (e) {
        logger.log(port, "error", e.message);
    }
}
