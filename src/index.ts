import * as fs from 'fs';
import * as AWS from 'aws-sdk';
import Bottleneck from 'bottleneck';

const JSONStream = require('JSONStream');

type CognitoISP = AWS.CognitoIdentityServiceProvider;
type ListUsersRequestTypes = AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest;
type AdminCreateUserRequest = AWS.CognitoIdentityServiceProvider.Types.AdminCreateUserRequest;
type AttributeType = AWS.CognitoIdentityServiceProvider.Types.AttributeType;


export const backupUsers = async (cognito: CognitoISP, params: ListUsersRequestTypes, file: string) => {
    if (params.UserPoolId == 'all') throw Error('Backing up all pools is not supported yet');

    const writeStream = fs.createWriteStream(file);
    const stringify = JSONStream.stringify();
    stringify.pipe(writeStream);

    try {
        const paginationCalls = async () => {
            const { Users = [], PaginationToken } = await cognito.listUsers(params).promise();
            Users.forEach(user => stringify.write(user as string));

            if (PaginationToken) {
                params.PaginationToken = PaginationToken;
                await paginationCalls();
            };
        };

        await paginationCalls();
    } catch (error) {
        throw error // to be catched by calling function
    } finally {
        stringify.end();
        stringify.on('end', () => {
            writeStream.end();
        })
    }
};


export const restoreUsers = async (cognito: CognitoISP, UserPoolId: string, file: string) => {
    const limiter = new Bottleneck({ minTime: 2000 });
    const readStream = fs.createReadStream(file);
    const parser = JSONStream.parse();

    parser.on('data', async (data: any[]) => {
        for (let user of data) {
            // filter out non-mutable attributes
            const attributes = user.Attributes.filter((attr: AttributeType) => attr.Name !== 'sub');


            /**
             * TODO: Fix InvalidParameterException: Username should be an email.
             * in cases where UsernameAttributes in userpool is set to email or phone.
             *
             * Error: "Users can use an email address or phone number as their "username" to sign up and sign in."
             * Possible solution: get `UsernameAttributes` from `describeUserPool` and decide accordingly.
            **/
            const params: AdminCreateUserRequest = {
                UserPoolId,
                Username: user.Username,
                DesiredDeliveryMediums: [],
                MessageAction: 'SUPPRESS', // TODO: will be dependent on fixed temp pass or auto-created
                ForceAliasCreation: false,
                TemporaryPassword: 'qwerty1234', // TODO: take this from user; give option for auto creation by aws cognito
                UserAttributes: attributes,
            };

            const wrapped = limiter.wrap(async () => cognito.adminCreateUser(params).promise());
            const response = await wrapped();
            console.log(response);
        };
    });

    readStream.pipe(parser);
};
