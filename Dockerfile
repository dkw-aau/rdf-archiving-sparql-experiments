FROM node:lts

# Get OSTRICH and Comunica query engine
RUN cd /opt && git clone https://github.com/dkw-aau/comunica-feature-versioning.git
RUN cd /opt && git clone --branch dev --recurse-submodules https://github.com/dkw-aau/ostrich-node.git

# Prepare OSTRICH
RUN apt-get update && apt-get -y install cmake libboost-iostreams-dev
RUN cd /opt/ostrich-node && ./install-kc-ci.sh
RUN cd /opt/ostrich-node && yarn install && yarn link

# Install Comunica
RUN cd /opt/comunica-feature-versioning && yarn link ostrich-bindings && yarn install
RUN cd /opt/comunica-feature-versioning/engines/query-sparql-ostrich && yarn link

# Copy experiment code and data
COPY src /opt/experiments/src
COPY queries /opt/experiments/queries
COPY package.json /opt/experiments/
COPY tsconfig.json /opt/experiments/

# Install
WORKDIR /opt/experiments/
RUN yarn link ostrich-bindings && yarn link @comunica/query-sparql-ostrich && yarn install && yarn build

# Node to production
ENV NODE_ENV=production

ENTRYPOINT [ "node", "./build/index.js", "/var/exp/data.ostrich", "/var/exp/queries/queries.json", "5", "/var/exp/progress.txt" ]
