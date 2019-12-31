import * as fs from 'fs';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import Bottleneck from 'bottleneck';
import * as delay from "delay";
import {JsonWriter, CsvWriter, Writer} from './writer';

const JSONStream = require('JSONStream');
const csv = require('csv-parser');

type CognitoISP = AWS.CognitoIdentityServiceProvider;
type ListUsersRequestTypes = AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest;
type AdminCreateUserRequest = AWS.CognitoIdentityServiceProvider.Types.AdminCreateUserRequest;
type AttributeType = AWS.CognitoIdentityServiceProvider.Types.AttributeType;

export enum OutputFormat {
    JSON = 'json',
    CSV = 'csv'
}

export const backupUsers = async (cognito: CognitoISP, UserPoolId: string, directory: string, delayDurationInMillis: number = 0, outputFormat: OutputFormat = OutputFormat.JSON) => {
    let userPoolList: string[] = [];

    if (UserPoolId == 'all') {
        // TODO: handle data.NextToken when exceeding the MaxResult limit
        const {UserPools} = await cognito.listUserPools({MaxResults: 60}).promise();
        userPoolList = userPoolList.concat(UserPools && UserPools.map(el => el.Id as string) as any);
    } else {
        userPoolList.push(UserPoolId);
    }

    for (let poolId of userPoolList) {
        // create directory if not exists
        !fs.existsSync(directory) && fs.mkdirSync(directory);

        const fileExtension = outputFormat === OutputFormat.JSON ? '.json' : '.csv';
        const file = path.join(directory, `${poolId}${fileExtension}`);
        const writeStream = fs.createWriteStream(file);
        let writer:Writer;
        if(outputFormat === OutputFormat.JSON) {
            writer = new JsonWriter(writeStream)
        } else {
            const userAttributes = await getUserAttributesFromPool(poolId, cognito);
            writer = new CsvWriter(writeStream, userAttributes);
        }

        const params: ListUsersRequestTypes = {
            UserPoolId: poolId
        };

        try {
            const paginationCalls = async () => {
                const {Users = [], PaginationToken} = await cognito.listUsers(params).promise();
                Users.forEach(user => writer.write(user as string));

                if (PaginationToken) {
                    params.PaginationToken = PaginationToken;
                    if (delayDurationInMillis > 0) {
                        await delay(delayDurationInMillis);
                    }
                    await paginationCalls();
                }
            };

            await paginationCalls();
        } catch (error) {
            throw error; // to be catched by calling function
        } finally {
            writer.end();
            writer.onEnd(() => writeStream.end());
        }
    }
};


export const restoreUsers = async (cognito: CognitoISP, UserPoolId: string, file: string, password?: string, passwordModulePath?: String) => {
    if (UserPoolId == 'all') throw Error(`'all' is not a acceptable value for UserPoolId`);
    let pwdModule: any = null;
    if (typeof passwordModulePath === 'string') {
        pwdModule = require(passwordModulePath);
    }

    const {UserPool} = await cognito.describeUserPool({UserPoolId}).promise();
    const UsernameAttributes = UserPool && UserPool.UsernameAttributes || [];

    const limiter = new Bottleneck({minTime: 2000});
    const readStream = fs.createReadStream(file);
    const parser = file.endsWith('.json') ? JSONStream.parse() : csv();

    const getUserAttributesFromCsv = function (userFromCsv: object): AttributeType[] {
        const attributes: AttributeType[] = [];
        const nonUserAttributes: string[] = ["Username", "UserCreateDate", "UserLastModifiedDate", "Enabled", "UserStatus"];
        Object.keys(userFromCsv)
            .filter((key: string) => !nonUserAttributes.includes(key))
            .forEach((Name: string) => {
                if (userFromCsv[Name]) {
                    attributes.push({Name, Value: userFromCsv[Name]})
                }
            });
        return attributes;
    };

    const getUserAttributesFromJson = function (userFromJson: any): AttributeType[] {
        return userFromJson.Attributes.filter((attr: AttributeType) => attr.Name !== 'sub');
    };

    const registerUser = async function (user: any, userAttributeGetter: any) {
        // filter out non-mutable attributes
        const attributes = userAttributeGetter(user);

        const params: AdminCreateUserRequest = {
            UserPoolId,
            Username: user.Username,
            UserAttributes: attributes
        };

        // Set Username as email if UsernameAttributes of UserPool contains email
        if (UsernameAttributes.includes('email')) {
            params.Username = pluckValue(attributes, 'email') as string;
            params.DesiredDeliveryMediums = ['EMAIL']
        } else if (UsernameAttributes.includes('phone_number')) {
            params.Username = pluckValue(attributes, 'phone_number') as string;
            params.DesiredDeliveryMediums = ['EMAIL', 'SMS']
        }

        // If password module is specified, use it silently
        // if not provided or it throws, we fallback to password if provided
        // if password is provided, use it silently
        // else set a cognito generated one and send email (default)
        let specificPwdExistsForUser = false;
        if (pwdModule !== null) {
            try {
                params.MessageAction = 'SUPPRESS';
                params.TemporaryPassword = pwdModule.getPwdForUsername(user.Username);
                specificPwdExistsForUser = true;
            } catch (e) {
                console.error(`"${e.message}" error occurred for user "${params.Username}" while getting password from ${passwordModulePath}. Falling back to default.`);
            }
        }
        if (!specificPwdExistsForUser && password) {
            params.MessageAction = 'SUPPRESS';
            params.TemporaryPassword = password;
        }
        const wrapped = limiter.wrap(async () => cognito.adminCreateUser(params).promise());
        try {
            await wrapped();
        } catch (e) {
            if (e.code === 'UsernameExistsException') {
                console.log(`Looks like user ${user.Username} already exists, ignoring.`)
            }
            if (e.name === 'InvalidParameterException' && e.message === 'User pool does not have SMS configuration to send messages.') {
                // Eating exception because its bug on AWS side
                // refer https://forums.aws.amazon.com/thread.jspa?threadID=248382 for more information
                return;
            } else {
                throw e;
            }
        }
    };

    parser.on('data', async (data: any[]) => {
        if (isCsvFile(file)) {
            await registerUser(data, getUserAttributesFromCsv)
        }
        for (let user of data) {
            await registerUser(user, getUserAttributesFromJson)
        }
    });

    readStream.pipe(parser);
};

const pluckValue = (arr: AttributeType[], key: string) => {
    const object = arr.find((attr: AttributeType) => attr.Name == key);

    if (!object) throw Error(`${key} not found in the user attribute`);

    return object.Value;
};

const isCsvFile = (file: string) => file.endsWith('.csv');

const getUserAttributesFromPool = async function (userPoolId: string, cognito: CognitoISP): Promise<string[]> {
    const {UserPool} = await cognito.describeUserPool({UserPoolId: userPoolId}).promise();

    // @ts-ignore
    return UserPool.SchemaAttributes.map((attribute: any) => attribute.Name)
        .filter((attributeName: any) => attributeName !== 'sub');
};