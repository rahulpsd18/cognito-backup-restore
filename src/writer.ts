const {Transform} = require('json2csv');
const JSONStream = require('JSONStream');

const getFieldExtractorForAttribute = function<V>(attributeName: string): DerivedCsvField<V> {
    return {
        label: attributeName,
        value: (row: any) => {
            const attribute = row["Attributes"].find((att: Attribute) => att.Name === attributeName);
            return attribute ? attribute.Value : undefined
        }
    }
};

interface DerivedCsvField<V> {
    label: string,
    value: (row: any, field: DerivedCsvField<V>) => V,
}

interface Attribute {
    Name: string,
    Value: any
}

const getHeaderFieldForCsvFile = function (userAttributes:string[]):any[] {
    const fixedFields:any[] = [
        "Username",
        "UserCreateDate",
        "UserLastModifiedDate",
        "Enabled",
        "UserStatus"
    ];
    const userAttributeFields:any[] = userAttributes.map(getFieldExtractorForAttribute);
    return fixedFields.concat(userAttributeFields);
}

export abstract class Writer {
    readonly encoder: any;
    readonly writeStream: any;

    protected constructor(writeStream: any, encoder: any) {
        this.encoder = encoder;
        this.writeStream = writeStream;
        this.encoder.pipe(this.writeStream);
    }

    public abstract write(user: any): void

    public onEnd(onEndCallBack:any): void {
        this.encoder.on('end', onEndCallBack);
    }

    public end(): void {
        this.encoder.end();
    }
}

export class CsvWriter extends Writer {
    constructor(writeStream:any, userAttributes:string[]) {
        const encoder = new Transform({fields: getHeaderFieldForCsvFile(userAttributes)});
        super(writeStream, encoder);
    }

    write(user: any): void {
        this.encoder.write(JSON.stringify(user))
    }
}

export class JsonWriter extends Writer {
    constructor(writeStream: any) {
        super(writeStream, JSONStream.stringify());
    }

    write(user: any): void {
        this.encoder.write(user as string)
    }
}