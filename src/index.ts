import { QueryManager } from "./query";
import {getNumberVersion} from "./evaluator";

function main (): void {
    const manager = new QueryManager("./queries/queries-bearc.json");
    const q1 = manager.getQuery(0, {type : "delta-materialization", versionStart: 2, versionEnd: 5, queryAdditions: true});
    console.log(q1);

    console.log(manager.numberOfQuery);
    getNumberVersion("bearc.ostrich").then((num) => {
        console.log(num);
    });
}

main();
