import * as AWS from 'aws-sdk';
import * as fuzzy from 'fuzzy';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { argv } from './args';
import {OutputFormat} from "../../build/OutputFormat";

inquirer.registerPrompt('directory', require('inquirer-select-directory'));
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
inquirer.registerPrompt('filePath', require('inquirer-file-path'));

const greenify = chalk.green;
const credentials = new AWS.IniLoader().loadFrom({});
const savedAWSProfiles = Object.keys(credentials);

const searchAWSProfile = async (_: never, input: string) => {
    input = input || '';
    const fuzzyResult = fuzzy.filter(input, savedAWSProfiles);
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

const verifyOptions = async () => {
    let { mode, profile, region, key, secret, userpool, directory, file, password, passwordModulePath, delay, outputFormat } = argv;

    // choose the mode if not passed through CLI or invalid is passed
    if (!mode || !['restore', 'backup'].includes(mode)) {
        const modeChoice = await inquirer.prompt<{ selected: string }>({
            type: 'list',
            name: 'selected',
            message: 'Choose the mode',
            choices: ['Backup', 'Restore'],
        });

        mode = modeChoice.selected.toLowerCase();
    }

    // choose your profile from available AWS profiles if not passed through CLI
    // only shown in case when no valid profile or no key && secret is passed.
    if (!savedAWSProfiles.includes(profile) && (!key || !secret)) {
        const awsProfileChoice = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your AWS Profile',
            source: searchAWSProfile,
        } as inquirer.Question);

        profile = awsProfileChoice.selected;
    };

    // choose your region if not passed through CLI
    if (!region) {
        const awsRegionChoice = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your Cognito Region',
            source: searchCognitoRegion,
        } as inquirer.Question);

        region = awsRegionChoice.selected;
    };

    if (!userpool) {
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
        const { UserPools } = await cognitoISP.listUserPools({ MaxResults: 60 }).promise();
        // TODO: handle data.NextToken when exceeding the MaxResult limit

        const userPoolList = UserPools
            && UserPools.map(el => ({ name: el.Name || '', value: el.Id || '' })) || []

        if (!userPoolList.length)
            throw Error(`No userpool found in this region. Are you sure the pool is in "${region}".`);

        if (mode === 'backup') userPoolList.unshift({ name: chalk.magentaBright.bold('ALL'), value: 'all' });

        const searchCognitoPool = async (_: never, input: string) => {
            input = input || '';

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
    };

    if (mode === 'backup' && !directory) {
        const directoryLocation = await inquirer.prompt({
            type: 'directory',
            name: 'selected',
            message: 'Choose your file destination',
            basePath: '.'
        } as inquirer.Question);

        directory = directoryLocation.selected;
    };

    if (mode === 'restore' && !file) {
        const fileLocation = await inquirer.prompt({
            type: 'filePath',
            name: 'selected',
            message: 'Choose the JSON file',
            basePath: '.'
        } as inquirer.Question);

        file = fileLocation.selected;
    }

    if (mode === 'restore' && passwordModulePath) {
        try {
            const pwdModule = require(passwordModulePath);
            if (typeof pwdModule.getPwdForUsername !== 'function') {
                throw Error(`Cannot find getPwdForUsername(username: String) in password module "${passwordModulePath}".`);
            };
        } catch(e) {
            throw Error(`Cannot load password module path "${passwordModulePath}".`);
        }
    }

    if (!outputFormat) {
        const modeChoice = await inquirer.prompt<{ selected: string }>({
            type: 'list',
            name: 'selected',
            message: 'Choose the output file format',
            choices: ['json', 'csv'],
            default: 'json'
        });

        outputFormat = modeChoice.selected;
    }

    if (outputFormat !== OutputFormat.JSON && outputFormat !== OutputFormat.CSV) {
        throw Error(`Unsupported output format ${outputFormat}. Only json and csv format are supported`)
    }
    
    return { mode, profile, region, key, secret, userpool, directory, file, password, passwordModulePath, delay, outputFormat }
};


export const options = verifyOptions();
