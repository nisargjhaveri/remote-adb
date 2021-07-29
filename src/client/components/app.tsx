import { useState, useEffect } from 'react';
import { UsbDevice, monitorDevices, requestDevice } from '../usbDevices';

function Device(props: {device: UsbDevice}) {
    let device: UsbDevice = props.device;

    return (
        <div>
            {device.serial} {device.name}
            {device.connected ? 
                <input type="button" value="Disconnect" onClick={device.disconnect} /> :
                <input type="button" value="Connect" onClick={device.connect} />
            }
        </div>
    )
}

export function App() {
    let [devices, setDevices] = useState<UsbDevice[]>([]);

    useEffect(() => {
        monitorDevices(setDevices);
    }, []);

    return (
        <div>
            <h1>Welcome</h1>
            <input type="button" value="Add device" id="request" onClick={requestDevice} />
            <div id="devices">
                {devices.map((device) => (<Device device={device} key={device.serial} />))}
            </div>
        </div>
    );
}