#!/usr/bin/env node

import * as server from './server/command';

import * as yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
    .usage("$0 <command> [options]")
    .command(server)
    .help().alias('h', 'help')
    .demandCommand(1, "")
    .strict()
    .parseSync()