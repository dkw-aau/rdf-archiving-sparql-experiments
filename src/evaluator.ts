import { fromPath } from "ostrich-bindings";
import { QueryEngine } from "@comunica/query-sparql-ostrich";
import { hrtime } from "node:process";
import { QueryManager } from "./query";
import { writeFileSync, readFileSync, existsSync } from "fs";

export async function getNumberVersion (storePath: string): Promise<number> {
    const ostrich = await fromPath(storePath, { readOnly: true });
    const maxVersion = ostrich.maxVersion;
    await ostrich.close();
    return maxVersion;
}

export class Evaluator {
    private queryEngine: QueryEngine;
    private queryManager: QueryManager;
    private queryFilePath: string;
    private storePath: string;
    private progressFilePath: string;

    public constructor(
        private expPath: string,
        private queryReplications: number,
        private numberVersion: number,
        private limit?: number) {
        this.queryFilePath = `${expPath}/queries.json`;
        this.storePath = `${expPath}/data.ostrich`;
        this.progressFilePath = `${expPath}/progress.txt`;
        this.queryEngine = new QueryEngine();
        this.queryManager = new QueryManager(this.queryFilePath);
    }

    /**
     * Measure the runtime of a query.
     * Return tuple (time, number-of-results) and write the time of arrival of each results in the given file.
     * @param queryString the SPARQL query string
     * @private
     */
    private async measureQueryRuntime (queryString: string): Promise<[bigint, number, Map<number,number>]> {
        return new Promise((resolve, reject) => {
            let count = 0;
            const timeMap = new Map<number, number>;
            const start = hrtime.bigint();
            this.queryEngine.queryBindings(queryString, { sources: [{ type: "ostrichFile", value: this.storePath }], lenient: true })
                .then(bindingsStream => {
                    bindingsStream.on("data", binding => {
                        const resTime = Number(hrtime.bigint() - start) / 1000;
                        count++;
                        timeMap.set(count, resTime);
                    });
                    bindingsStream.on("end", () => {
                        const end = hrtime.bigint();
                        resolve([(end - start), count, timeMap]);
                    });
                    bindingsStream.on("error", (error) => {
                        reject(error);
                    });
                })
                .catch(reason => {
                    reject(reason);
                });
        });
    }

    private async measureQueryRuntimeReplications (queryString: string): Promise<[bigint, number, number, Map<number, number>]> {
        // Query runtime measurement
        let runtimes = BigInt(0);
        let results = 0;
        const avgTimeMap = new Map<number, number>;
        for (let i = 0; i < this.queryReplications; i++) {
            try {
                const [runtime, queryCount, timeMap] = await this.measureQueryRuntime(queryString);
                runtimes += runtime;
                results += queryCount;
                for (const [num, time] of timeMap) {
                    if (avgTimeMap.has(num)) {
                        avgTimeMap.set(num, (avgTimeMap.get(num)+time));
                    } else {
                        avgTimeMap.set(num, time);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        // Compute avg for each result time across runs
        for (const [num, time] of avgTimeMap) {
            avgTimeMap.set(num, (time / this.queryReplications));
        }
        const runtimeMicroSeconds = (runtimes / BigInt(this.queryReplications)) / BigInt(1000);
        const count = results / this.queryReplications;
        const timeSeconds = Number(runtimeMicroSeconds) / 1000 / 1000;
        const throughput = count / timeSeconds;
        return [runtimeMicroSeconds, count, throughput, avgTimeMap];
    }

    private async measureRuntimeVM (queryNumber: number, version: number): Promise<[bigint, number, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "version-materialization", version }, this.limit);
        const [runtime, results, throughput, timeMap] = await this.measureQueryRuntimeReplications(queryString);
        if (typeof this.progressFilePath !== "undefined") {
            writeFileSync(this.progressFilePath, `VM ${queryNumber} ${version}`);
        }
        const resultsTimeFileName = `${this.expPath}/vm-${queryNumber}-${version}.csv`;
        writeFileSync(resultsTimeFileName, "Result,Time\n", { encoding: "utf8", flag: "w" });
        for (const [num, time] of timeMap) {
            writeFileSync(resultsTimeFileName, `${num},${time}\n`, { encoding: "utf8", flag: "a" });
        }
        return [runtime, results, throughput];
    }

    private async measureRuntimeDM (queryNumber: number, versionStart: number, versionEnd: number): Promise<[bigint, number, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "delta-materialization", versionStart, versionEnd, queryAdditions: true }, this.limit);
        const [runtime, results, throughput, timeMap] = await this.measureQueryRuntimeReplications(queryString);
        if (typeof this.progressFilePath !== "undefined") {
            writeFileSync(this.progressFilePath, `DM ${queryNumber} ${versionStart} ${versionEnd}`);
        }
        const resultsTimeFileName = `${this.expPath}/dm-${queryNumber}-${versionStart}-${versionEnd}.csv`;
        writeFileSync(resultsTimeFileName, "Result,Time\n", { encoding: "utf8", flag: "w" });
        for (const [num, time] of timeMap) {
            writeFileSync(resultsTimeFileName, `${num},${time}\n`, { encoding: "utf8", flag: "a" });
        }
        return [runtime, results, throughput];
    }

    private async measureRuntimeVQ (queryNumber: number): Promise<[bigint, number, number]> {
        const queryString = this.queryManager.getQuery(queryNumber, { type: "version-query" }, this.limit);
        const [runtime, results, throughput, timeMap] = await this.measureQueryRuntimeReplications(queryString);
        if (typeof this.progressFilePath !== "undefined") {
            writeFileSync(this.progressFilePath, `VQ ${queryNumber}`);
        }
        const resultsTimeFileName = `${this.expPath}/vq-${queryNumber}.csv`;
        writeFileSync(resultsTimeFileName, "Result,Time\n", { encoding: "utf8", flag: "w" });
        for (const [num, time] of timeMap) {
            writeFileSync(resultsTimeFileName, `${num},${time}\n`, { encoding: "utf8", flag: "a" });
        }
        return [runtime, results, throughput];
    }

    /**
     * Recursive evaluation of VM queries.
     * Call itself with the next version until it reach the max version.
     * When it does, call the DM querying evaluation function.
     * Stop when there is no more query to evaluate.
     * @param queryNumber the query to evaluate
     * @param version the version to query
     */
    private async measureQueryingVM (queryNumber: number, version: number): Promise<void> {
        if (queryNumber === this.queryManager.numberOfQuery) {
            return;
        }
        if (version === this.numberVersion) {
            return this.measureQueryingDM(queryNumber, 0, 1);
        }
        if (version === 0 && !existsSync(`${this.expPath}/vm.csv`)) {
            writeFileSync(`${this.expPath}/vm.csv`, "QueryNum,Version,Runtime,Throughput,NumResults\n", { encoding: "utf8", flag: "w" });
        }
        console.log(`VM - Query ${queryNumber} for version ${version}...`);
        const [runtime, results, throughput] = await this.measureRuntimeVM(queryNumber, version);
        const outputString = `${queryNumber},${version},${runtime},${throughput},${results}\n`;
        writeFileSync(`${this.expPath}/vm.csv`, outputString, { encoding:"utf8", flag:"a" });
        return this.measureQueryingVM(queryNumber, version+1);
    }

    /**
     * Recursive evaluation of DM queries.
     * Call itself with the next versionEnd until it reach the max version.
     * When it does, call the VQ querying evaluation function.
     * Stop when there is no more query to evaluate.
     * @param queryNumber the query to evaluate
     * @param versionStart the start version to query
     * @param versionEnd the end version to query
     */
    private async measureQueryingDM (queryNumber: number, versionStart: number, versionEnd: number): Promise<void> {
        if (queryNumber === this.queryManager.numberOfQuery) {
            return;
        }
        if (versionEnd === this.numberVersion) {
            return this.measureQueryingVQ(queryNumber);
        }
        if (versionStart === 0 && versionEnd === 1 && !existsSync(`${this.expPath}/dm.csv`)) {
            writeFileSync(`${this.expPath}/dm.csv`, "QueryNum,VersionStart,VersionEnd,Runtime,Throughput,NumResults\n", { encoding:"utf8", flag:"w" });
        }
        if (versionStart !== versionEnd) {
            console.log(`DM - Query ${queryNumber} for version ${versionStart} and ${versionEnd}...`);
            const [runtime, results, throughput] = await this.measureRuntimeDM(queryNumber, versionStart, versionEnd);
            const outputString = `${queryNumber},${versionStart},${versionEnd},${runtime},${throughput},${results}\n`;
            writeFileSync(`${this.expPath}/dm.csv`, outputString, { encoding:"utf8", flag:"a" });
        }
        versionStart = (versionStart + 1) % 2;
        if (versionStart === 0) {
            versionEnd++;
        }
        return this.measureQueryingDM(queryNumber, versionStart, versionEnd);
    }

    /**
     * Recursive evaluation of VQ queries.
     * Call the VM querying evaluation function with the next query.
     * Stop when there is no more query to evaluate.
     * @param queryNumber
     */
    private async measureQueryingVQ (queryNumber: number): Promise<void> {
        if (queryNumber === this.queryManager.numberOfQuery) {
            return;
        }
        if (!existsSync(`${this.expPath}/vq.csv`)) {
            writeFileSync(`${this.expPath}/vq.csv`, "QueryNum,Runtime,Throughput,NumResults\n", { encoding:"utf8", flag:"w" });
        }
        console.log(`VQ - Query ${queryNumber}...`);
        const [runtime, results, throughput] = await this.measureRuntimeVQ(queryNumber);
        writeFileSync(`${this.expPath}/vq.csv`, `${queryNumber},${runtime},${throughput},${results}\n`, { encoding:"utf8", flag:"a" });
        return this.measureQueryingVM(queryNumber+1, 0);
    }

    /**
     * Run querying runtime measurement.
     * Try to read the progress file if any, and start from there.
     */
    public async measureQueryingSave (): Promise<void> {
        let progress;
        try {
            progress = readFileSync(this.progressFilePath).toString();
        } catch (error) {
            // Run from start as there is no progress file to be found
            return this.measureQueryingVM(0, 0);
        }
        const split = progress.split(" ");
        const qrType = split[0];
        const qrNum = parseInt(split[1], 10);
        switch (qrType) {
        case "VM":
            return this.measureQueryingVM(qrNum, parseInt(split[2], 10)+1);
        case "DM":
            // eslint-disable-next-line no-case-declarations
            const vs = (parseInt(split[2], 10)+1)%2;
            // eslint-disable-next-line no-case-declarations
            const ve = vs === 0 ? parseInt(split[3], 10)+1 : parseInt(split[3], 10);
            return this.measureQueryingDM(qrNum, vs, ve);
        case "VQ":
            return this.measureQueryingVM(qrNum+1, 0);
        }
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
