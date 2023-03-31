import { fromPath } from "ostrich-bindings";
import { QueryEngine } from "@comunica/query-sparql-ostrich";
import { hrtime } from "node:process";
import {QueryManager} from "./query";


export async function getNumberVersion (storePath: string): Promise<number> {
    const ostrich = await fromPath(storePath, { readOnly: true });
    const maxVersion = ostrich.maxVersion;
    await ostrich.close();
    return maxVersion;
}

export class Evaluator {
    private queryEngine: QueryEngine;
    private queryManager: QueryManager;

    public constructor(private storePath: string,
        queryFilePath: string,
        private queryReplications: number,
        private numberVersion: number) {
        this.queryEngine = new QueryEngine();
        this.queryManager = new QueryManager(queryFilePath);
    }

    private async measureQueryRuntime (queryString: string): Promise<[bigint, number]> {
        const start = hrtime.bigint();
        let end: bigint;
        const bindingsStream = await this.queryEngine.queryBindings(queryString, { sources: [{ type: "ostrichFile", value: this.storePath }], lenient: true });
        let count = 0;
        bindingsStream.on("data", (binding) => {
            count++;
        });
        bindingsStream.on("end", () => {
            end = hrtime.bigint();
        });
        bindingsStream.on("error", (error) => {
            throw new Error(error);
        });
        return [end - start, count];
    }

    private async measureQueryRuntimeReplications (queryString: string): Promise<[bigint, number]> {
        // Warmup
        await this.measureQueryRuntime(queryString);
        // Query runtime measurement
        let runtimes = BigInt(0);
        let results = 0;
        for (let i = 0; i < this.queryReplications; i++) {
            const [runtime, queryCount] = await this.measureQueryRuntime(queryString);
            runtimes += runtime;
            results += queryCount;
        }
        const runtimeMicroSeconds = (runtimes / BigInt(this.queryReplications)) / BigInt(1000);
        return [runtimeMicroSeconds, (results / this.queryReplications)];
    }

    private async measureRuntimeVM (queryNumber: number, version: number): Promise<[bigint, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "version-materialization", version });
        return this.measureQueryRuntimeReplications(queryString);
    }

    private async measureRuntimeDM (queryNumber: number, versionStart: number, versionEnd: number): Promise<[bigint, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "delta-materialization", versionStart, versionEnd, queryAdditions: true });
        return this.measureQueryRuntimeReplications(queryString);
    }

    private async measureRuntimeVQ (queryNumber: number): Promise<[bigint, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "version-query" });
        return this.measureQueryRuntimeReplications(queryString);
    }

    public async measureQuerying (): Promise<void> {
        for (let queryNum = 0; queryNum < this.queryManager.numberOfQuery; queryNum++) {
            console.log(`---QUERY START: ${queryNum}`);

            console.log("--- ---VERSION MATERIALIZED");
            console.log("patch,offset,limit,count-ms,median-mus,lookup-mus,results");
            for (let version = 0; version < this.numberVersion; version++) {
                const [runtime, results] = await this.measureRuntimeVM(queryNum, version);
                console.log(`${version},0,0,0,0,${runtime},${results}`);
            }

            console.log("--- ---DELTA MATERIALIZED");
            console.log("patch_start,patch_end,offset,limit,count-ms,median-mus,lookup-mus,results");
            for (let vEnd = 1; vEnd < this.numberVersion; vEnd++) {
                for (let vStart = 0; vStart <= 1; vStart++) {
                    if (vEnd > vStart) {
                        const [runtime, results] = await this.measureRuntimeDM(queryNum, vStart, vEnd);
                        console.log(`${vStart},${vEnd},0,0,0,0,${runtime},${results}`);
                    }
                }
            }

            console.log("--- ---VERSION");
            console.log("offset,limit,count-ms,median-mus,lookup-mus,results");
            const [runtime, results] = await this.measureRuntimeVQ(queryNum);
            console.log(`0,0,0,0,${runtime},${results}`);
        }
    }

}