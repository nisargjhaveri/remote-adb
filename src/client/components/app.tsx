import { useState, useEffect, useCallback } from 'react';
import { Separator } from '@fluentui/react/lib/Separator';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Label } from '@fluentui/react/lib/Label';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { NeutralColors } from '@fluentui/theme/lib/colors/FluentColors';

import { UsbDevice, monitorDevices, requestDevice } from '../usbDevices';
import * as byteSize from 'byte-size';

import { initializeIcons } from '@fluentui/font-icons-mdl2';
initializeIcons();

function CommunicationSpeed(props: {device: UsbDevice}) {
    let device: UsbDevice = props.device;
    let [speedCounterState, setSpeedConunterState] = useState({up: 0, down: 0, time: 0});
    let [speed, setSpeed] = useState({up: 0, down: 0});

    let updateSpeed = useCallback(() => {
        let currentTime = new Date().getTime();
        let timeElapsed = currentTime - speedCounterState.time; // Milliseconds

        setSpeed({
            up: Math.floor((device.bytesTransferred.up - speedCounterState.up) * 1000 / timeElapsed),
            down: Math.floor((device.bytesTransferred.down - speedCounterState.down) * 1000 / timeElapsed),
        });

        console.log(currentTime, timeElapsed, device.bytesTransferred, speedCounterState);

        setSpeedConunterState({
            up: device.bytesTransferred.up,
            down: device.bytesTransferred.down,
            time: currentTime
        });
    }, [setSpeed, setSpeedConunterState, speedCounterState]);

    // Update speed periodically when connected.
    useEffect(() => {
        let interval: NodeJS.Timer = null;
        if (device.connected) {
            if (speedCounterState.time === 0) updateSpeed();
            interval = setInterval(updateSpeed, 1000);
        } 
        else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [device.connected, speedCounterState]);

    // Cleanup speed and speedCounterState on disconnect
    useEffect(() => {
        if (!device.connected) {
            setSpeedConunterState({
                up: 0, down: 0, time: 0
            });
            setSpeed({
                up: 0, down: 0
            })
        }
    }, [device.connected]);

    return device.connected && (
        <Stack horizontal verticalAlign="center" tokens={{childrenGap: 's1'}}>
            <Text>&nbsp;</Text>
            <Text>Up: {byteSize(speed.up).toString()}/s</Text>
            <Text>&nbsp;</Text>
            <Text>Down: {byteSize(speed.down).toString()}/s</Text>
        </Stack>
    )
}

function Device(props: {device: UsbDevice}) {
    let device: UsbDevice = props.device;

    return (
        <div>
            <Stack horizontal tokens={{childrenGap: 'l1'}} verticalAlign="center">
                {device.connected ? 
                    <DefaultButton text="Disconnect" onClick={device.disconnect} /> :
                    <PrimaryButton text="Connect" onClick={device.connect} />
                }
                <Label>{device.name} ({device.serial})</Label>
                <CommunicationSpeed device={device} />
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
            <Stack tokens={{padding: 'l2', childrenGap: 'l2'}}>
                <Stack.Item align="center">
                    <Text variant="mediumPlus" style={{color: NeutralColors.gray130}}>Share connected Android devices for debugging on the server</Text>
                </Stack.Item>
                <Stack horizontal tokens={{childrenGap: 'm', padding: 's'}} horizontalAlign="center" verticalAlign="center">
                    <Text>Device not visible in the list below?</Text>
                    <PrimaryButton text="Add device" id="request" onClick={requestDevice} iconProps={{iconName: "Add"}} />
                </Stack>
                <Separator>Connected Devices</Separator>
                {!devices.length && (
                    <Stack.Item align="center">
                        <Text style={{color: NeutralColors.gray90}}>No devices found</Text>
                    </Stack.Item>
                )}
                <Stack tokens={{childrenGap: 'm', padding: 's'}}>
                    {devices.map((device) => (<Device device={device} key={device.serial} />))}
                </Stack>
            </Stack>
        </div>
    );
}