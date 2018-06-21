import * as fs from 'fs';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import * as fuzzy from 'fuzzy';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { argv } from './args';

const SharedIniFile = require('aws-sdk/lib/shared_ini');

inquirer.registerPrompt('directory', require('inquirer-select-directory'));
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

// console.log('ARGV>>:', argv, '\n\n');

const greenify = chalk.green;

const searchAWSProfile = async (_: never, input: string) => {
    input = input || '';
    const fuzzyResult = fuzzy.filter(input, new SharedIniFile().getProfiles());
    return fuzzyResult.map(el => {
        return el.original;
    });
};

const searchCognitoRegion = async (_: never, input: string) => {
    input = input || '';
    const region = [
        { get name() { return greenify(this.value) + ' :: US East (N. Virginia)' }, value: 'us-east-1' },
        { get name() { return greenify(this.value) + ' :: US East (Ohio)' }, value: 'us-east-2' },
        { get name() { return greenify(this.value) + ' :: US West (Oregon)' }, value: 'us-west-2' },
        { get name() { return greenify(this.value) + ' :: Asia Pacific (Mumbai)' }, value: 'ap-south-1' },
        { get name() { return greenify(this.value) + ' :: Asia Pacific (Tokyo)' }, value: 'ap-northeast-1' },
        { get name() { return greenify(this.value) + ' :: Asia Pacific (Seoul)' }, value: 'ap-northeast-2' },
        { get name() { return greenify(this.value) + ' :: Asia Pacific (Singapore)' }, value: 'ap-southeast-1' },
        { get name() { return greenify(this.value) + ' :: Asia Pacific (Sydney)' }, value: 'ap-southeast-2' },
        { get name() { return greenify(this.value) + ' :: EU (Frankfurt)' }, value: 'eu-central-1' },
        { get name() { return greenify(this.value) + ' :: EU (Ireland)' }, value: 'eu-west-1' },
        { get name() { return greenify(this.value) + ' :: EU (London)' }, value: 'eu-west-2' }
    ];
    const fuzzyResult = fuzzy.filter(input, region, { extract: el => el.value });
    return fuzzyResult.map(el => {
        return el.original
    });
};

const abcd = async () => {
    let { mode, profile, region, key, secret, userpool, file } = argv;

    // choose the mode if not passed through CLI or invalid is passed
    if (!mode || !['restore','backup'].includes(mode)) {
        const modeChoice = await inquirer.prompt<{ selected: string }>({
            type: 'list',
            name: 'selected',
            message: 'Choose the mode',
            choices: ['Backup', 'Restore'],
        });

        mode = modeChoice.selected.toLowerCase();
    }

    // choose your profile from available AWS profiles if not passed through CLI
    // only shown in case when no profile or no key && secret is passed.
    if (!profile && (!key || !secret)) {
        const awsProfileChoice = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your AWS Profile',
            source: searchAWSProfile,
        } as inquirer.Question);

        profile = awsProfileChoice.selected;
    }

    // choose your region if not passed through CLI
    if (!region) {
        const awsRegionChoice = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your Cognito Region',
            source: searchCognitoRegion,
        } as inquirer.Question);

        region = awsRegionChoice.selected;
    }

    if (!userpool) {
        // update the config of aws-sdk based on profile/credentials passed
        AWS.config.update({ region });
        // TODO: check for aws passed credentials in case region is not provided
        AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile });

        const cognitoISP = new AWS.CognitoIdentityServiceProvider();
        const { UserPools } = await cognitoISP.listUserPools({ MaxResults: 60 }).promise();
        // TODO: handle data.NextToken when exceeding the MaxResult limit

        const userPoolList = UserPools
            && UserPools.map(el => ({ name: el.Name || '', value: el.Id || '' })) || []

        userPoolList.unshift({ name: chalk.magentaBright.bold('ALL'), value: 'all' });

        const searchCognitoPool = async (_: never, input: string) => {
            input = input || '';
            // TODO: Check for case when no cognito pool is listed for the region

            const fuzzyResult = fuzzy.filter(input, userPoolList, { extract: el => el.value });
            return fuzzyResult.map(el => {
                return el.original
            });
        };

        // choose your cognito pool from the region you selected
        const cognitoPoolChoice = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your Cognito Pool',
            source: searchCognitoPool,
            pageSize: 60
        } as inquirer.Question);

        userpool = cognitoPoolChoice.selected;
    }

    if (!file) {
        const fileLocation = await inquirer.prompt({
            type: 'directory',
            name: 'selected',
            message: 'Choose your file destination',
            basePath: '.'
        } as inquirer.Question);

        // TODO: fix this
        // file = path.join(fileLocation.selected, 'CognitoBackups');

        // create the folder if not exists
        // !fs.existsSync(file) && fs.mkdirSync(file);
        file = path.join(fileLocation.selected, `${userpool}.json`);
    }

    return { mode, profile, region, key, secret, userpool, file }
};


export const options = abcd();
