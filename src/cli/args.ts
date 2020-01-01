import * as yargs from 'yargs';
import chalk from 'chalk';

const dimmed = chalk.dim;
const greyed = chalk.gray;
const bold = chalk.bold;

const version = require('../../package').version;

export const argv = yargs
    // header
    .usage(`\nYou can run commands with "cognito-backup-restore" or the shortcut "cbr"\n
    Usage: $0 <command> [options]`)

    // backup command
    .command('backup', dimmed`Backup/export all users in specified user pool`, (yargs) => {
        return yargs.options({
            mode: {
                default: 'backup',
                hidden: true
            },
            directory: {
                alias: ['dir'],
                describe: dimmed`Directory to export json file to`,
                string: true
            }
        })
            .option('fileFormat', {
                alias: ['o'],
                describe: dimmed`Format of the backup file. Supported format: json, csv`,
                string: true
            });
    })

    // restore command
    .command('restore', dimmed`Restore/import users to a single user pool`, (yargs) => {
        return yargs.options({
            mode: {
                default: 'restore',
                hidden: true
            },
            file: {
                alias: ['f'],
                describe: dimmed`file to import data from. Supported formats json and csv`,
                string: true
            },
            password: {
                alias: ['pwd'],
                describe: dimmed`TemporaryPassword of the users imported`,
                string: true
            },
            passwordModulePath: {
                alias: ["pwdModule"],
                describe: dimmed`A module that exports an interface getPwdForUsername(username: String) method, fall back to password parameter if throw`,
                string: true
            }
        });
    })

    // examples
    .example('$0 backup', greyed`Follow the interactive guide to backup userpool(s)`)
    .example('$0 restore', greyed`Follow the interactive guide to restore userpool`)
    .example('$0 backup -p <PROFILE> [OPTIONS]', greyed`Backup using the options provided`)
    .example('$0 restore -p <PROFILE> [OPTIONS]', greyed`Restore using the options provided`)

    // options
    .option('profile', {
        alias: ['p'],
        describe: dimmed`Use a specific profile from your credential file`,
        conflicts: ['aws-access-key', 'aws-secret-key'],
        string: true,
    })
    .option('region', {
        alias: ['r'],
        describe: dimmed`The region to use. Overrides config/env settings`,
        string: true,
    })
    .option('aws-access-key', {
        alias: ['key', 'k'],
        describe: dimmed`The AWS Access Key to use. Overrides config/env settings`,
        conflicts: ['profile'],
        string: true,
    })
    .option('aws-secret-key', {
        alias: ['secret', 's'],
        describe: dimmed`The AWS Secret Key to use. Overrides config/env settings`,
        conflicts: ['profile'],
        string: true
    })
    .option('userpool', {
        alias: ['pool'],
        describe: dimmed`The Cognito pool to use. 'all' to backup all userpools.`,
        string: true
    })
    .option('delay', {
        describe: dimmed`delay in millis between alternate users batch(60) backup, to avoid rate limit error`,
        number: true
    })

    // help
    .help('help', dimmed`Show help`)
    .alias('help', 'h')
    .showHelpOnFail(false, bold`Specify --help for available options`)

    // version
    .version('version', dimmed`Show version number`, (function () {
        return version;
    })())
    .alias('version', 'v')

    // footer
    .epilog(dimmed`\nPlease report any issues/suggestions here:\nhttps://github.com/rahulpsd18/cognito-backup-restore/issues\n`)
    .strict()
    .wrap(Math.min(120, yargs.terminalWidth()))
    .argv;