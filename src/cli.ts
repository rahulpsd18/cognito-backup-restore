import * as AWS from 'aws-sdk';
import * as fuzzy from 'fuzzy';
import * as inquirer from 'inquirer';
import chalk from 'chalk';

const SharedIniFile = require('aws-sdk/lib/shared_ini');

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

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
        { get name() {return chalk.green(this.value) + ' :: US East (N. Virginia)'}, value: 'us-east-1' },
        { get name() {return chalk.green(this.value) + ' :: US East (Ohio)'}, value: 'us-east-2' },
        { get name() {return chalk.green(this.value) + ' :: US West (Oregon)'}, value: 'us-west-2' },
        { get name() {return chalk.green(this.value) + ' :: Asia Pacific (Mumbai)'}, value: 'ap-south-1' },
        { get name() {return chalk.green(this.value) + ' :: Asia Pacific (Tokyo)'}, value: 'ap-northeast-1' },
        { get name() {return chalk.green(this.value) + ' :: Asia Pacific (Seoul)'}, value: 'ap-northeast-2' },
        { get name() {return chalk.green(this.value) + ' :: Asia Pacific (Singapore)'}, value: 'ap-southeast-1' },
        { get name() {return chalk.green(this.value) + ' :: Asia Pacific (Sydney)'}, value: 'ap-southeast-2' },
        { get name() {return chalk.green(this.value) + ' :: EU (Frankfurt)'}, value: 'eu-central-1' },
        { get name() {return chalk.green(this.value) + ' :: EU (Ireland)'}, value: 'eu-west-1' },
        { get name() {return chalk.green(this.value) + ' :: EU (London)'}, value: 'eu-west-2' }
    ];
    const fuzzyResult = fuzzy.filter(input, region, {extract: el => el.value });
    return fuzzyResult.map(el => {
        return el.original
    });
};


(async () => {
    try {
        // choose your profile from available AWS profiles on the local machine
        const awsProfile = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your AWS Profile',
            source: searchAWSProfile,
        });

        // choose your region from available AWS profiles on the local machine
        let awsRegion = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your Cognito Region',
            source: searchCognitoRegion,
        });

        // update the config of aws-sdk
        AWS.config.update({region: awsRegion.selected});
        AWS.config.credentials = new AWS.SharedIniFileCredentials({ profile: awsProfile.selected });

        const cognitoISP = new AWS.CognitoIdentityServiceProvider();

        const {UserPools} = await cognitoISP.listUserPools({ MaxResults: 60 }).promise();
        // TODO: handle data.NextToken when exceeding the MaxResult limit

        const userPoolList = UserPools && UserPools.map(el => ({name: el.Name || '', value: el.Id || ''})) || []


        const searchCognitoPool = async (_: never, input: string) => {
            input = input || '';
            // TODO: Check for case when no cognito pool is listed for the region
            userPoolList.unshift({ name: chalk.magentaBright.bold('ALL'), value: 'all' });

            const fuzzyResult = fuzzy.filter(input, userPoolList, { extract: el => el.value });
            return fuzzyResult.map(el => {
                return el.original
            });
        };

        // choose your cognito pool from the region you selected
        let cognitoPool = await inquirer.prompt({
            type: 'autocomplete',
            name: 'selected',
            message: 'Choose your Cognito Region',
            source: searchCognitoPool,
            pageSize: 60
        });

        console.log(chalk.blue(`You have selected: ${chalk.yellow(cognitoPool.selected)}`));

    } catch (error) {
        console.error(error);
    }

})();
