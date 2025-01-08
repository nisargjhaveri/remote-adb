import EventEmitter from "events";
import WebSocket from 'isomorphic-ws';

// Imports only available when running in node
import nodeFetch from "node-fetch";
import makeFetchCookie from 'fetch-cookie'
import type { CookieJar } from "tough-cookie";

export { WebSocket };

const url = {
    status: "status",
    login: "login",
}

export type ServerStatus = {
    _error?: string,
    loginSupported?: boolean,
    loginRequired?: boolean,
}

export class ServerConnection {
    private serverAddress: string;

    private events = new EventEmitter();

    private updateLoopRunning = false;
    private lastServerStatusPromise = Promise.resolve({});

    private cookieJar: CookieJar = undefined;
    private _fetch: any;    // There are some differences in node-fetch and fetch.

    constructor(address: string) {
        this.serverAddress = address;

        if (typeof window !== "undefined" && typeof fetch === "function") {
            this._fetch = fetch.bind(window);
        }
        else {
            this.cookieJar = new makeFetchCookie.toughCookie.CookieJar();
            this._fetch = makeFetchCookie(nodeFetch, this.cookieJar);
        }
    }

    private resolveUrl(url: string, protocol: "http"|"ws") {
        let resolvedUrl = new URL(url, this.serverAddress);

        resolvedUrl.protocol = resolvedUrl.protocol.replace("http", protocol);

        return resolvedUrl.href;
    }

    fetch(url: string, init?: RequestInit): Promise<Response> {
        let resolvedUrl = this.resolveUrl(url, "http");

        return this._fetch(resolvedUrl, init);
    }

    async createWebSocket(url: string) {
        const resolvedUrl = this.resolveUrl(url ?? "", "ws");
        if (this.cookieJar) {
            return new WebSocket(resolvedUrl, {
                headers: {
                    "Cookie": await this.cookieJar.getCookieString(resolvedUrl)
                }
            });
        }
        else {
            return new WebSocket(resolvedUrl);
        }
    }

    login = async (password: string) => {
        const res = await this.fetch(url.login, {
            method: "post",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({password: password})
        });

        if (res.status !== 200) {
            throw new Error(`Status code ${res.status}`);
        }

        const data: any = await res.json();
        if (data.result !== "OK") {
            throw new Error(data.message ?? "Unknown error");
        }
    }

    monitorServerStatus = async (callback: (status: ServerStatus) => void) => {
        this.events.on("statusChanged", callback);

        if (!this.updateLoopRunning) {
            this.updateStatusLoop();
        }
    }

    getServerStatus = async (timeout: number = 10000): Promise<ServerStatus> => {
        await this.lastServerStatusPromise
        this.lastServerStatusPromise = this.fetchServerStatus(timeout);

        const status = await this.lastServerStatusPromise;

        this.events.emit("statusChanged", status);
        return status;
    }

    private updateStatusLoop = async () => {
        this.updateLoopRunning = true;

        await this.getServerStatus();
        setTimeout(this.updateStatusLoop, 5000);
    }

    private fetchServerStatus = async (timeout: number): Promise<ServerStatus> => {
        try {
            const res = await this.fetch(url.status, {
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(timeout)
            });

            if (res.status !== 200) {
                throw new Error(`Status code ${res.status}`);
            }

            return await res.json();
        }
        catch (e) {
            return {
                _error: e.message
            }
        }
    }
}

