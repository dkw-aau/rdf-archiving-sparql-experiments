import { Evaluator, getNumberVersion } from "./evaluator";

// Process arguments: node index.js <path-to-experiment-path> <num replications>(optional) <limit>(optional)
async function main (): Promise<void> {
    if (process.argv.length < 3 || process.argv.length > 5) {
        console.log("Arguments: <path-to-experiment-path> <num replications>(optional) <limit>(optional)");
        return;
    }
    const experimentPath = process.argv[2];
    let replications = 5;
    if (typeof process.argv[3] !== "undefined") {
        replications = parseInt(process.argv[3], 10);
    }
    let limit = -1;
    if (typeof process.argv[4] !== "undefined") {
        limit = parseInt(process.argv[4], 10);
    }
    const numVersions = await getNumberVersion(`${experimentPath}/data.ostrich`);
    const evaluator = new Evaluator(experimentPath, replications, numVersions, limit);
    await evaluator.measureQueryingSave();
}

main().then().catch((reason) => {
    console.error(reason);
});
