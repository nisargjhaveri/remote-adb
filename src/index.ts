#!/usr/bin/env node

import { commandServer } from './server/command';
import { commandConnect, commandDevices } from './client/command';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
    .usage("$0 <command> [options]")
    .command(commandServer)
    .command(commandDevices)
    .command(commandConnect)
    .parserConfiguration({
        'duplicate-arguments-array': false,
    })
    .help().alias('h', 'help')
    .demandCommand(1, "")
    .strict()
    .parseSync()