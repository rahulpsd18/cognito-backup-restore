import * as fs from 'fs';

const JSONStream = require('JSONStream');

type CognitoISP = AWS.CognitoIdentityServiceProvider
type ListUsersRequestTypes = AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest

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
}