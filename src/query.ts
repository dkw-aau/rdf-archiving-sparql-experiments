import { readFileSync } from "fs";

interface QueryObject {
    core: {
        [index: number]: string
    },
    header: {
        [index: number]: string
    }
}

interface QueriesObject {
    [index: number]: QueryObject
}

export class QueryManager {
    protected queries: QueriesObject;

    public constructor ( queriesPath: string ) {
        const queriesBuffer = readFileSync(queriesPath).toString("utf8");
        this.queries = JSON.parse(queriesBuffer);
    }

    private makeVersionedQuerySection ( queryNum: number, version: number | string, extraIndent: false) {
        const indent = extraIndent ? "\t" : "";
        const versionTag = version === "?version" ? version : `<version:${version}>`;
        let str = `\n\t${indent}GRAPH ${versionTag} {`;
        const query = this.queries[queryNum];
        for (const l in query.core) {
            str += `\n\t\t${indent}${query.core[l]}`;
        }
        str += `\n\t${indent}}`;
        return str;
    }
}