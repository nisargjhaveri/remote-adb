import { AdbWebUsbBackend, AdbWebUsbBackendWatcher } from '@yume-chan/adb-backend-webusb';
import { connectDevice } from './deviceConnection';

async function requestDevice() {
    await AdbWebUsbBackend.requestDevice();
    refreshDevices();
}

let connectedDevices: {[key: string]: AdbWebUsbBackend} = {};

async function refreshDevices() {
    console.log("Refreshing device list");
    document.querySelector('div#devices').childNodes.forEach(c => c.remove());

    const devices = (await AdbWebUsbBackend.getDevices()).map((device) => {
        if (device.serial in connectedDevices) {
            return connectedDevices[device.serial];
        }
        return device;
    });

    devices.forEach((device) => {
        const div = document.createElement('div');

        const span = document.createElement('span');
        span.innerText = `${device.serial} (${device.name})`;
        div.appendChild(span);

        const button = document.createElement('input');

        if (device.connected) {
            button.value = "Disconnect";
            button.type = "button";
            button.addEventListener('click', async () => {
                device.dispose();

                delete connectedDevices[device.serial];

                refreshDevices();
            });
        }
        else {
            button.value = "Connect";
            button.type = "button";
            button.addEventListener('click', async () => {
                await connectDevice(device);

                connectedDevices[device.serial] = device;
                device.onDisconnected(() => {
                    delete connectedDevices[device.serial];
                });

                refreshDevices();
            });
        }

        div.appendChild(button);

        document.querySelector('div#devices').prepend(div);
    })
}

window.addEventListener("load", () => {
    refreshDevices();

    new AdbWebUsbBackendWatcher(refreshDevices);
    document.querySelector("input#request").addEventListener("click", requestDevice);
});