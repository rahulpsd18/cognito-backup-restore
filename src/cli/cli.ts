#!/usr/bin/env node

import * as AWS from 'aws-sdk';
import * as ora from 'ora';

import chalk from 'chalk';
import { backupUsers, restoreUsers } from '../index';
import { options } from './options';

const red = chalk.red;
const green = chalk.green;
const orange = chalk.keyword('orange');

(async () => {
    let spinner = ora({ spinner: 'dots4', hideCursor: true });
    try {
        const { mode, profile, region, key, secret, userpool, directory, file, password, passwordModulePath, delay, metadata, env} = await options;

        // update the config of aws-sdk based on profile/credentials passed
        AWS.config.update({ region });

        if (profile) {
            AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });
        } else if (key && secret) {
            AWS.config.credentials = new AWS.Credentials({
                accessKeyId: key, secretAccessKey: secret
            });
        } else if (env) {
            AWS.config.credentials = new AWS.EnvironmentCredentials('AWS');
        } else if (metadata) {
            AWS.config.credentials = new AWS.EC2MetadataCredentials({});
        } 

        const cognitoISP = new AWS.CognitoIdentityServiceProvider();

        if (mode === 'backup') {
            spinner = spinner.start(orange`Backing up userpool`);
            await backupUsers(cognitoISP, userpool, directory, delay);
            spinner.succeed(green(`JSON Exported successfully to ${directory}/\n`));
        } else if (mode === 'restore') {
            spinner = spinner.start(orange`Restoring userpool`);
            await restoreUsers(cognitoISP, userpool, file, password, passwordModulePath);
            spinner.succeed(green(`Users imported successfully to ${userpool}\n`));
        } else {
            spinner.fail(red`Mode passed is invalid, please make sure a valid command is passed here.\n`);
        }
    } catch (error) {
        spinner.fail(red(error.message));
    }
})();
