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

const fields = [
    "Username",
    "UserCreateDate",
    "UserLastModifiedDate",
    "Enabled",
    "UserStatus",
    getFieldExtractorForAttribute("phone_number"),
    getFieldExtractorForAttribute("email"),
];

export default class Writer {
    private readonly encoder: any;
    private readonly writeStream: any;

    private constructor(writeStream: any, encoder: any) {
        this.encoder = encoder;
        this.writeStream = writeStream;
        this.encoder.pipe(this.writeStream);
    }

    public write(user: any): void {
        this.encoder.write(user as string);
    }

    public onEnd(onEndCallBack:any): void {
        this.encoder.on('end', onEndCallBack);
    }

    public end(): void {
        this.encoder.end();
    }

    public static CsvWriter(writeStream: any): Writer {
        const encoder = new Transform({fields});
        return new Writer(writeStream, encoder);
    }

    public static JsonWriter(writeStream: any): Writer {
        return new Writer(writeStream, JSONStream.stringify())
    }
}
