import { useState, useEffect, useCallback } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Label } from '@fluentui/react/lib/Label';
import { Icon } from '@fluentui/react/lib/Icon';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { NeutralColors } from '@fluentui/theme/lib/colors/FluentColors';

import { RemoteAdbDevice } from '../../client/UsbDeviceManager';
import { ServerConnection } from '../../client/ServerConnection';

import * as bytes from 'bytes';

function CommunicationSpeed(props: {device: RemoteAdbDevice}) {
    let device: RemoteAdbDevice = props.device;
    let [speedCounterState, setSpeedConunterState] = useState({up: 0, down: 0, time: 0});
    let [speed, setSpeed] = useState({up: 0, down: 0});

    let updateSpeed = useCallback(() => {
        let currentTime = new Date().getTime();
        let timeElapsed = currentTime - speedCounterState.time; // Milliseconds

        setSpeed({
            up: Math.floor((device.bytesTransferred.up - speedCounterState.up) * 1000 / timeElapsed),
            down: Math.floor((device.bytesTransferred.down - speedCounterState.down) * 1000 / timeElapsed),
        });

        // console.log(currentTime, timeElapsed, device.bytesTransferred, speedCounterState);

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

    let formatSpeed = useCallback((b) => {
        return `${bytes.format(b, {decimalPlaces: 1, unitSeparator: ' '})}/s`;
    }, []);

    return device.connected && (
        <Stack horizontal verticalAlign="center" tokens={{childrenGap: 's1'}}>
            <Text>Up: {formatSpeed(speed.up)}</Text>
            <Text>&nbsp;</Text>
            <Text>Down: {formatSpeed(speed.down)}</Text>
        </Stack>
    )
}

export function Device(props: {device: RemoteAdbDevice, serverConnection: ServerConnection}) {
    const [error, setError] = useState(undefined);
    const [isConnecting, setConnecting] = useState(false);

    const { device, serverConnection } = props;

    const onConnect = useCallback(async () => {
        let connecting = true;
        setTimeout(() => setConnecting(connecting), 100); // delay to reduce flicker

        try {
            resetError();

            let wsUrl = new URL(window.location.href);
            wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');

            await device.connect(serverConnection);
        }
        catch (e) {
            console.log(e);
            setError(e.message);
        }
        connecting = false;
        setConnecting(false);
    }, [device, setError, setConnecting]);

    const resetError = useCallback(() => {
        setError(undefined);
    }, [setError]);

    return (
        <div style={{border: '1px solid', borderColor: NeutralColors.gray70}}>
            <Stack tokens={{padding: 'm', childrenGap: 'm'}}>
                <Stack horizontal tokens={{childrenGap: 'l1'}} verticalAlign="center" >
                    <Icon iconName="CellPhone" style={{fontSize: "larger", fontWeight: "bold"}} />
                    <Stack.Item grow>
                        <Label>{device.name} ({device.serial})</Label>
                    </Stack.Item>
                    {
                    device.connected ? 
                        <DefaultButton text="Disconnect" onClick={device.disconnect} /> :
                    isConnecting ?
                        <DefaultButton text="Connecting..." disabled /> :
                    // Otherwise
                        <PrimaryButton text="Connect to remote" onClick={onConnect} />
                    }
                </Stack>
                <Stack horizontal tokens={{childrenGap: 'l1'}} verticalAlign="center" >
                    <Stack.Item grow={!device.connected}>
                        { 
                            error ?
                                (<MessageBar
                                    messageBarType={MessageBarType.error}
                                    isMultiline={false}
                                    onDismiss={resetError}
                                    dismissButtonAriaLabel="Dismiss"
                                >
                                    "{error}"
                                </MessageBar>) :
                            device.connected ?
                                (<MessageBar
                                    messageBarType={MessageBarType.success}
                                    isMultiline={false}
                                >
                                    Connected
                                </MessageBar>) :
                            isConnecting ?
                                (<MessageBar isMultiline={false}>
                                    Connecting to remote...
                                </MessageBar>) :
                            // Otherwise
                                (<MessageBar isMultiline={false}>
                                    Ready to connect
                                </MessageBar>)
                        }
                    </Stack.Item>
                    {device.connected && <Stack.Item grow>&nbsp;</Stack.Item>}
                    <CommunicationSpeed device={device} />
                </Stack>
            </Stack>
        </div>
    )
}
