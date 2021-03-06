import * as net from 'net';

let adbConnection: net.Socket|undefined;
let connectedDevices: Set<Number> = new Set();

async function adbMonitorDisconnected() {
    if (!adbConnection) { return; }

    adbConnection = undefined;
    console.log("adb disconnected");
}

async function adbMonitorConnected(socket: net.Socket) {
    adbConnection = socket;
    console.log("adb connected");

    let gotSuccessResponse = false;
    let success = false;
    adbConnection.on("data", (data) => {
        let header = data.slice(0, 4).toString("utf8");
        if (!gotSuccessResponse) {
            if (header === "OKAY") {
                gotSuccessResponse = true;
                success = true;
                console.log("track-devices", "OKAY");
            }
            else if (header === "FAIL") {
                gotSuccessResponse = true;
                success = false;

                // parse the failure message
                let length = parseInt(data.slice(4, 8).toString("utf8"), 16);
                let message = data.slice(8, 4 + length).toString("utf8");
                console.log("track-devices", "FAIL", message);
            }
            else {
                // Something wrong
                socket.end();
            }
        }
        else {
            let length = parseInt(header, 16);
            let message = data.slice(4, 4 + length).toString("utf8");
            console.log("track-devices");
            console.log(message);
        }
    });

    adbConnection.write(adbMessage(`host:track-devices-l`));

    addAllAdbDevices();
}

async function addAllAdbDevices() {
    if (!connectedDevices.size) return;
    console.log("try adding all previous devices");

    connectedDevices.forEach((port) => {
        adbConnect(port);
    })
}

export async function monitorAdbServer() {
    do {
        console.log("Trying to connect to adb");

        let timer = new Promise((resolve, reject) => {
            setTimeout(resolve, 1000);
        });

        let socket = net.connect(5037);

        socket.on("connect", () => {
            adbMonitorConnected(socket);
        })

        await new Promise<void>((resolve, reject) => {
            socket.on("error", (e) => {
                // Do othing
            });
    
            socket.on("close", (hadError) => {
                adbMonitorDisconnected();
                resolve();
            });
        });

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
    console.log(port, disconnect ? "disconnecting device from adb" : "connecting device to adb");

    let socket = net.connect(5037);

    socket.on("connect", () => {
        socket.write(adbMessage(`host:${disconnect ? "disconnect" : "connect"}:127.0.0.1:${port}`));
    });

    let gotSuccessResponse = false;
    let success = false;
    socket.on("data", (data) => {
        let header = data.slice(0, 4).toString("utf8");
        if (!gotSuccessResponse) {
            if (header === "OKAY") {
                gotSuccessResponse = true;
                success = true;
                // console.log(port, "OKAY");
            }
            else if (header === "FAIL") {
                gotSuccessResponse = true;
                success = false;

                // parse the failure message
                let length = parseInt(data.slice(4, 8).toString("utf8"), 16);
                let message = data.slice(8, 4 + length).toString("utf8");
                console.log(port, "FAIL", message);
            }
            else {
                // Something wrong
                socket.end();
            }
        }
        else {
            let length = parseInt(header, 16);
            let message = data.slice(4, 4 + length).toString("utf8");
            console.log(port, message);
        }
    });

    socket.on("error", (e) => {
        // Do nothing
    });

    socket.on("close", (hadError) => {
        // Do nothing
    });
}
