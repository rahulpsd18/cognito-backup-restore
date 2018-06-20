import * as AWS from 'aws-sdk';
import chalk from 'chalk';
import { backupUsers } from '../index';
import { options } from './options';

const red = chalk.red;
const green = chalk.green;
const orange = chalk.keyword('orange');

(async () => {
    try {
        const { mode, profile, region, key, secret, userpool, file } = await options;
        console.log(await options);

        // update the config of aws-sdk based on profile/credentials passed
        AWS.config.update({ region });
        // TODO: check for aws passed credentials in case region is not provided
        AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });

        const cognitoISP = new AWS.CognitoIdentityServiceProvider();

        if(mode === 'backup') {
            await backupUsers(cognitoISP, {UserPoolId: userpool}, file);
            console.log(green`JSON Exported successfully to ${file}\n`);
        } else if(mode === 'restore') {
            console.log(orange`Restore is not yet implemented\n`);
        } else {
            console.log(red`Mode param is invalid, please make sure a valid command is passed here.\n`);
        }
    } catch (error) {
        console.error(red(error.message));
    }
})();
