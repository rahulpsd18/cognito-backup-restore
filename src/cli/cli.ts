#!/usr/bin/env node

import * as AWS from 'aws-sdk';
import chalk from 'chalk';
import { backupUsers, restoreUsers } from '../index';
import { options } from './options';

const red = chalk.red;
const green = chalk.green;
const orange = chalk.keyword('orange');

(async () => {
    try {
        const { mode, profile, region, key, secret, userpool, file, password } = await options;

        // update the config of aws-sdk based on profile/credentials passed
        AWS.config.update({ region });

        if (profile) {
            AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });
        } else if (key && secret) {
            AWS.config.credentials = new AWS.Credentials({
                accessKeyId: key, secretAccessKey: secret
            });
        }

        const cognitoISP = new AWS.CognitoIdentityServiceProvider();

        if(mode === 'backup') {
            await backupUsers(cognitoISP, userpool, file);
            console.log(green`JSON Exported successfully to ${file}\n`);
        } else if(mode === 'restore') {
            await restoreUsers(cognitoISP, userpool, file, password);
            console.log(green(`Users imported successfully to ${userpool}\n`));
        } else {
            console.log(red`Mode passed is invalid, please make sure a valid command is passed here.\n`);
        }
    } catch (error) {
        console.error(red(error.message));
    }
})();
