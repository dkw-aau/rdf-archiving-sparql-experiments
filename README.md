# rdf-archiving-sparql-experiments
Repository containing code to run full SPARQL experiments with OSTRICH and Comunica.

# Run docker
```shell
docker build -t sparql-archiving-exp .
docker run --name sparql-exp --rm --volume path_to_ostrich:/var/ostrich sparql-archiving-exp
docker logs -f sparql-exp | tee output.txt
```