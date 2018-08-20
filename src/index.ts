import * as fs from 'fs';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import Bottleneck from 'bottleneck';

const JSONStream = require('JSONStream');

type CognitoISP = AWS.CognitoIdentityServiceProvider;
type ListUsersRequestTypes = AWS.CognitoIdentityServiceProvider.Types.ListUsersRequest;
type AdminCreateUserRequest = AWS.CognitoIdentityServiceProvider.Types.AdminCreateUserRequest;
type AttributeType = AWS.CognitoIdentityServiceProvider.Types.AttributeType;


export const backupUsers = async (cognito: CognitoISP, UserPoolId: string, directory: string) => {
    let userPoolList: string[] = [];

    if (UserPoolId == 'all') {
        // TODO: handle data.NextToken when exceeding the MaxResult limit
        const { UserPools } = await cognito.listUserPools({ MaxResults: 60 }).promise();
        userPoolList = userPoolList.concat(UserPools && UserPools.map(el => el.Id as string) as any);
    } else {
        userPoolList.push(UserPoolId);
    }

    for (let poolId of userPoolList) {

        // create directory if not exists
        !fs.existsSync(directory) && fs.mkdirSync(directory)

        const file = path.join(directory, `${poolId}.json`)
        const writeStream = fs.createWriteStream(file);
        const stringify = JSONStream.stringify();

        stringify.pipe(writeStream);

        const params: ListUsersRequestTypes = {
            UserPoolId: poolId
        };

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
            throw error; // to be catched by calling function
        } finally {
            stringify.end();
            stringify.on('end', () => {
                writeStream.end();
            });
        }
    }
};


export const restoreUsers = async (cognito: CognitoISP, UserPoolId: string, file: string, password?: string, passwordModulePath?: String) => {
    if (UserPoolId == 'all') throw Error(`'all' is not a acceptable value for UserPoolId`);
    let pwdModule: any = null;
    if (typeof passwordModulePath === 'string') {
        pwdModule = require(passwordModulePath);
    }

    const { UserPool } = await cognito.describeUserPool({ UserPoolId }).promise();
    const UsernameAttributes = UserPool && UserPool.UsernameAttributes || [];

    const limiter = new Bottleneck({ minTime: 2000 });
    const readStream = fs.createReadStream(file);
    const parser = JSONStream.parse();

    parser.on('data', async (data: any[]) => {
        for (let user of data) {
            // filter out non-mutable attributes
            const attributes = user.Attributes.filter((attr: AttributeType) => attr.Name !== 'sub');

            const params: AdminCreateUserRequest = {
                UserPoolId,
                Username: user.Username,
                UserAttributes: attributes
            };

            // Set Username as email if UsernameAttributes of UserPool contains email
            if (UsernameAttributes.includes('email')) {
                params.Username = pluckValue(user.Attributes, 'email') as string;
                params.DesiredDeliveryMediums = ['EMAIL']
            } else if (UsernameAttributes.includes('phone_number')) {
                params.Username = pluckValue(user.Attributes, 'phone_number') as string;
                params.DesiredDeliveryMediums = ['EMAIL', 'SMS']
            }

            // If password module is specified, use it silently
            // if not provided or it throws, we fallback to password if provided
            // if password is provided, use it silently
            // else set a cognito generated one and send email (default)
            let specificPwdExistsForUser = false;
            if (pwdModule !== null){
                try {
                    params.MessageAction = 'SUPPRESS';
                    params.TemporaryPassword = pwdModule.getPwdForUsername(user.Username);
                    specificPwdExistsForUser = true;
                } catch (e) {
                }
            }
            if (!specificPwdExistsForUser && password) {
                params.MessageAction = 'SUPPRESS';
                params.TemporaryPassword = password;
            }
            const wrapped = limiter.wrap(async () => cognito.adminCreateUser(params).promise());
            await wrapped();
        };
    });

    readStream.pipe(parser);
};

const pluckValue = (arr: AttributeType[], key: string) => {
    const object = arr.find((attr: AttributeType) => attr.Name == key);

    if (!object) throw Error(`${key} not found in the user attribute`)

    return object.Value;
};
