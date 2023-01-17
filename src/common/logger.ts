export type Logger = {
    log(...data: any[]): void;

    debug(...data: any[]): void;
    info(...data: any[]): void;
    warn(...data: any[]): void;
    error(...data: any[]): void;
}

class GlobalLogger implements Logger {
    private _logger: Logger = console;

    setGlobalLogger(logger: Logger) {
        this._logger = logger;
    }

    log(...data: any[]): void {
        this._logger.log(...data);
    }

    debug(...data: any[]): void {
        this._logger.debug(...data);
    }

    info(...data: any[]): void {
        this._logger.info(...data);
    }

    warn(...data: any[]): void {
        this._logger.warn(...data);
    }

    error(...data: any[]): void {
        this._logger.error(...data);
    }
}

let _logger = new GlobalLogger();

export let logger: Logger = _logger;
export let setLogger: (logger: Logger) => void = _logger.setGlobalLogger.bind(_logger);

export default logger;
