#!/usr/bin/env node

import * as server from './server/command';
import { commandConnect, commandDevices } from './client/command';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
    .usage("$0 <command> [options]")
    .command(server)
    .command(commandDevices)
    .command(commandConnect)
    .help().alias('h', 'help')
    .demandCommand(1, "")
    .strict()
    .parseSync()