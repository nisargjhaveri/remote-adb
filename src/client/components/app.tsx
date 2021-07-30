import { useState, useEffect } from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';

import { UsbDevice, monitorDevices, requestDevice } from '../usbDevices';
import { Label, Separator, Stack, Text } from '@fluentui/react';

import { initializeIcons } from '@fluentui/font-icons-mdl2';
initializeIcons();

function Device(props: {device: UsbDevice}) {
    let device: UsbDevice = props.device;

    return (
        <div>
            <Stack horizontal>
                {device.connected ? 
                    <DefaultButton text="Disconnect" onClick={device.disconnect} /> :
                    <PrimaryButton text="Connect" onClick={device.connect} />
                }
                <Label style={{marginLeft: 32}}>{device.serial} - {device.name}</Label>
            </Stack>
        </div>
    )
}

export function App() {
    let [devices, setDevices] = useState<UsbDevice[]>([]);

    useEffect(() => {
        monitorDevices(setDevices);
    }, []);

    return (
        <div style={{maxWidth: 650, margin: "0 auto"}}>
            {/* <Text variant="large">Welcome</Text> */}
            <div style={{marginTop: 64}}>
                <div style={{marginBottom: 48}}>
                    <Text style={{marginRight: 12}}>Device not visible in the list below?</Text>
                    <PrimaryButton text="Add device" id="request" onClick={requestDevice} iconProps={{iconName: "Add"}} />
                </div>
                <Separator>Connected Devices</Separator>
                <Stack style={{marginTop: 12}}>
                    {devices.map((device) => (<Device device={device} key={device.serial} />))}
                </Stack>
            </div>
        </div>
    );
}