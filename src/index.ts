import * as fs from 'fs';
import * as AWS from 'aws-sdk';
import { Transform, TransformOptions, TransformCallback } from 'stream';
import { Transform as json2csvStream } from 'json2csv';

const JSONStream = require('JSONStream');

type CognitoISP = AWS.CognitoIdentityServiceProvider
type ListUsersRequestTypes = AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest


class TransformStream extends Transform {
    constructor(options: TransformOptions) {
        super(options);
    }

    _transform(chunk: any, encoding: string, callback: TransformCallback) {
        for (let entry of chunk) {
            for (let el in entry.Attributes) {
                entry[entry.Attributes[el].Name] = entry.Attributes[el].Value;
            }
            delete entry.Attributes;
        }
        this.push(JSON.stringify(chunk));
        callback();
    }
}

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

// Heavily under active development
// Will be helpful when job creation will be implemented to restore users
export const json2csv = async (file: string) => {
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const stream: Transform = JSONStream.parse();
    const transform = new TransformStream({ objectMode: true });
    const json2csv = new json2csvStream();
    const output = fs.createWriteStream(`${file}.csv`, { encoding: 'utf8' });

    return input.pipe(stream).pipe(transform).pipe(json2csv);
};
