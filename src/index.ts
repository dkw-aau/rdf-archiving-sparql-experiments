import { Evaluator, getNumberVersion } from "./evaluator";

// Process arguments: node index.js <path-to-ostrich> <path-to-query-file-json> <num replications>(optional)
async function main (): Promise<void> {
    if (process.argv.length < 4 || process.argv.length > 5) {
        console.log("Arguments: <path-to-ostrich> <path-to-query-file-json> <num replications>(optional)");
        return;
    }
    const ostrichPath = process.argv[2];
    const queryPath = process.argv[3];
    let replications = 5;
    if (typeof process.argv[4] !== "undefined") {
        replications = parseInt(process.argv[4]);
    }
    const numVersions = await getNumberVersion(ostrichPath);
    const evaluator = new Evaluator(ostrichPath, queryPath, replications, numVersions);
    await evaluator.measureQuerying();
}

main().then().catch((reason) => {
    console.error(reason);
});
