import type { VersionContext } from "@comunica/types-versioning";
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

    private makeVersionedQuerySection (queryNum: number, version: number | string, extraIndent: boolean): string {
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

    public getQuery (queryNum: number, versionContext: VersionContext, limit?: number): string {
        let queryHeader = "";
        let firstHeader = true;
        for (const l in this.queries[queryNum].header) {
            const newline = firstHeader ? "" : "\n";
            queryHeader += newline + this.queries[queryNum].header[l];
            firstHeader = false;
        }
        // Get the selected query's core
        let queryCore = "SELECT * WHERE {";
        switch (versionContext.type) {
        case "version-materialization":
            queryCore += this.makeVersionedQuerySection(queryNum, versionContext.version, false);
            break;
        case "delta-materialization":
            queryCore += this.makeVersionedQuerySection(queryNum, versionContext.versionStart, false) + " .";
            queryCore += "\n\tFILTER (NOT EXISTS {";
            queryCore += this.makeVersionedQuerySection(queryNum, versionContext.versionEnd, true);
            queryCore += "\n\t})";
            break;
        case "version-query":
            queryCore += this.makeVersionedQuerySection(queryNum, "?version", false);
            break;
        }
        queryCore += "\n}";
        if (typeof limit === "number") {
            queryCore += ` LIMIT ${limit}`;
        }
        return `${queryHeader}\n${queryCore}`;
    }

    public get numberOfQuery (): number {
        return Object.keys(this.queries).length;
    }

}