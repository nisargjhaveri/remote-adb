import { useState, useEffect, useCallback, Dispatch, SetStateAction, useMemo } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { TextField } from '@fluentui/react/lib/TextField';
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { DefaultButton, MessageBarButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Separator } from '@fluentui/react/lib/Separator';

import { ServerStatus, ServerConnection } from '../../client/ServerConnection';

function DelayedProgressIndicator() {
    const [showProgress, setShowProgress] = useState(false);

    useEffect(() => {
        let timeout = setTimeout(() => {
            setShowProgress(true);
        }, 200);

        return () => clearTimeout(timeout);
    }, []);

    return showProgress ? <ProgressIndicator /> : null;
}


function LoginDialog(props: {showDialog: boolean, setShowDialog: Dispatch<SetStateAction<Boolean>>, onLoginSuccess: () => void, serverConnection: ServerConnection}) {
    const [loginError, setLoginError] = useState(undefined);
    const [loginSuccess, setLoginSuccess] = useState(false);
    const [loginProgress, setLoginProgress] = useState(false);
    const [password, setPassword] = useState(undefined);

    const {showDialog, setShowDialog, onLoginSuccess, serverConnection} = props;

    const hideDialog = useCallback(() => {
        setShowDialog(false);
    }, [setShowDialog]);

    const dialogDismissed = useCallback(() => {
        setLoginError(undefined);
        setLoginSuccess(false);
    }, [setLoginError, setLoginSuccess]);

    const handlePasswordChanged = useCallback((event) => {
        setPassword(event.target.value);
    }, [setPassword]);

    const resetLoginError = useCallback(() => {
        setLoginError(undefined);
    }, [setLoginError]);

    const loginFailed = useCallback((message) => {
        setLoginProgress(false);
        setLoginError(message);
    }, [setLoginProgress, setLoginError]);

    const login = useCallback(async (event) => {
        resetLoginError();
        setLoginProgress(true);

        try {
            await serverConnection.login(password);

            setLoginProgress(false);
            setLoginSuccess(true);
            onLoginSuccess();
        }
        catch (e) {
            loginFailed(`Login failed: ${e.message}`);
        }
    }, [password, resetLoginError, setLoginProgress, loginFailed, setLoginSuccess, hideDialog, onLoginSuccess]);

    return (
        <Dialog
            hidden={!showDialog}
            onDismiss={hideDialog}
            dialogContentProps={{type: DialogType.normal, title: "Login"}}
            modalProps={{isBlocking: true, onDismissed: dialogDismissed}}
            >
            {loginError && (
                <MessageBar
                    messageBarType={MessageBarType.error}
                    isMultiline={false}
                    onDismiss={resetLoginError}
                    dismissButtonAriaLabel="Dismiss"
                >
                    {loginError}
                </MessageBar>
            )}
            {loginProgress && (
                <DelayedProgressIndicator />
            )}
            <form>
                <TextField
                    label="Password"
                    type="password"
                    autoFocus
                    onChange={handlePasswordChanged}
                    />
                <DialogFooter>
                    <PrimaryButton type="submit" onClick={login} text="Login" disabled={loginProgress || loginSuccess} />
                    <DefaultButton onClick={hideDialog} text="Cancel" disabled={loginProgress || loginSuccess} />
                </DialogFooter>
            </form>
        </Dialog>
    );
}

function StatusItem(props: {type: MessageBarType, message: string, muted?: boolean, [key: string]: any}) {
    const {type, muted, message, ...rest} = props;

    return (
        <MessageBar messageBarType={type} isMultiline={false} styles={muted && {root: {background: "transperant"}}} {...rest}>
            {message}
        </MessageBar>
    );
}

export function Status(props: {serverConnection: ServerConnection, setServerConnectionReady: (ready: boolean) => void}) {
    const [initialized, setInitialized] = useState(false);

    const [statusError, setStatusError] = useState(undefined);
    const [loginSupported, setLoginSupported] = useState(false);
    const [loginRequired, setLoginRequired] = useState(false);

    const [showLoginDialog, setShowLoginDialog] = useState(false);

    const { serverConnection, setServerConnectionReady } = props;

    const updateStatus = useCallback(async (status: ServerStatus) => {
        if (status._error) {
            setStatusError(`Cannot get server status: ${status._error}`);
            setServerConnectionReady(false);
        }
        else {
            setStatusError(undefined)
            setLoginSupported(status.loginSupported);
            setLoginRequired(status.loginRequired);

            if (status.loginSupported && status.loginRequired) {
                setServerConnectionReady(false);
            } else {
                setServerConnectionReady(true);
            }
        }

        setInitialized(true);
    }, [setInitialized, setLoginSupported, setLoginRequired, setStatusError, setServerConnectionReady]);

    // Monitor server status
    useEffect(() => {
        serverConnection.monitorServerStatus(updateStatus);
    }, [updateStatus]);

    // Show login dialog once initialized
    useMemo(() => {
        if (initialized) {
            setShowLoginDialog(!statusError && loginSupported && loginRequired);
        }
    }, [initialized, statusError, loginSupported, loginRequired]);

    const onLoginSuccess = useCallback(() => {
        setLoginRequired(false);
        setServerConnectionReady(true);
        serverConnection.getServerStatus();
    }, [setLoginRequired, setServerConnectionReady]);

    return (
        <>
            <Separator>Server Status</Separator>
            <Stack tokens={{padding: "0 l2"}}>
                {initialized ? (
                    <>
                        {statusError ? (
                            <StatusItem type={MessageBarType.error} message={statusError} />
                        ) : (
                            <StatusItem type={MessageBarType.success} message="Server reachable" muted />
                        )}
                        {!statusError && loginSupported && (loginRequired ? (
                            <StatusItem type={MessageBarType.warning} message="Authentication required" actions={(
                                <MessageBarButton text="Login" id="request" onClick={() => setShowLoginDialog(true)} />
                            )} />
                        ) : (
                            <StatusItem type={MessageBarType.success} message="Authentication successful" muted />
                        ))}
                    </>
                ) : (
                    <ProgressIndicator label="Connecting to server..." />
                )}
                <LoginDialog showDialog={showLoginDialog} setShowDialog={setShowLoginDialog} onLoginSuccess={onLoginSuccess} serverConnection={serverConnection} />
            </Stack>
        </>
    )
}
