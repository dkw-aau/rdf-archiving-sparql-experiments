import { Evaluator, getNumberVersion } from "./evaluator";

// Process arguments: node index.js <path-to-experiment-path> <num replications>(optional)
async function main (): Promise<void> {
    if (process.argv.length < 2 || process.argv.length > 3) {
        console.log("Arguments: <path-to-experiment-path> <num replications>(optional)");
        return;
    }
    const experimentPath = process.argv[1];
    let replications = 5;
    if (typeof process.argv[2] !== "undefined") {
        replications = parseInt(process.argv[2]);
    }
    const numVersions = await getNumberVersion(`${experimentPath}/data.ostrich`);
    const evaluator = new Evaluator(experimentPath, replications, numVersions);
    await evaluator.measureQueryingSave();
}

main().then().catch((reason) => {
    console.error(reason);
});
