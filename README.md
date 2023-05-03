# RDF Archiving SPARQL Experiments 2023
Repository containing code to run full SPARQL experiments with OSTRICH and Comunica.

## Experiment data structure

The way the experiment code and corresponding docker has been setup expect a specific folder structure.  
The experiment folder contains the following:
* *"data.ostrich/"* : OSTRICH files. Creation of those file should be done beforehand. (see the [OSTRICH](https://github.com/opelgrin/ostrich.git) repository).
* *"queries.json"* : The file containing the queries.
* *"progress.txt"* (optional) : A file saving the progress of the experiments. The experiments will start from that point if the file exists.

## Queries

Queries should be formatted as a JSON file and available in a subdirectory in your experiment folder.  
Example queries, from the BEAR-C benchmark can be found in the *"./queries"* folder.

## Run docker
```shell
docker build -t sparql-archiving-exp .
docker run --name sparql-exp --rm --volume path_to_ostrich:/var/ostrich sparql-archiving-exp
docker logs -f sparql-exp | tee output.txt
```
Alternatively, a script, *"run-docker.sh"* simplify the starting process of docker.
