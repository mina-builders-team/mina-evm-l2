# EVM Layer-2 on Mina

This project implements a ZK rollup solution to enable EVM-compatible smart contracts on Mina Protocol. It uses `op-succinct` for EVM execution and proof generation, with proof conversion to Mina's Kimchi proving system via Nori-zk.

This project is a work in progress and is not yet ready for production.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
  - [System Requirements](#system-requirements)
- [Installation](#installation)
  - [Base Dependencies](#base-dependencies)
  - [Project Dependencies](#project-dependencies)
- [Running the Network locally](#running-the-network-locally)
- [AWS ARM Setup](#aws-arm-setup)
- [Testing the Network](#testing-the-network)
- [Environment Variables](#environment-variables)
  - [op-succinct](#op-succinct)
- [Architecture Details](#architecture-details)
- [Dependencies](#dependencies)
- [Contributing](#contributing)
- [License](#license)

## Overview

The architecture consists of:
- A centralized sequencer that uses `op-succinct` for EVM execution and initial proof generation
- A Mina zkApp for settlement and state verification
- Celestia for data availability

## Prerequisites

### System Requirements
- Linux-based operating system
- Docker
- Node.js (LTS version)
- Rust
- SP1
- Kurtosis
- numactl

## Installation

### Base Dependencies

```bash
# Update system packages
sudo apt upgrade -y
sudo apt update -y

# Install Node.js using NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"

# Install SP1
curl -L https://sp1up.succinct.xyz | bash
source ~/.bashrc
sp1up

# Install Docker
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"
apt-cache policy docker-ce
sudo apt install -y docker-ce
sudo systemctl status docker

# Install Kurtosis
echo "deb [trusted=yes] https://apt.fury.io/kurtosis-tech/ /" | sudo tee /etc/apt/sources.list.d/kurtosis.list
sudo apt install -y kurtosis-cli

# Install numactl
sudo apt-get install -y numactl
```

### Project Dependencies

```bash
# Install required system packages
sudo apt-get update && apt-get install -y \
    curl \
    jq \
    clang \
    build-essential \
    git \
    pkg-config \
    libssl-dev
```

## Running the Network locally

```bash
kurtosis run --enclave my-testnet github.com/ethpandaops/optimism-package --args-file op-network.yaml --image-download always
```

## AWS ARM Setup

For running on AWS ARM instances (e.g., t4g, c7g), you will need a local copy of https://github.com/ethpandaops/optimism-package. Follow these additional steps:

```bash
# Install required packages
sudo yum install -y gcc gcc-c++ docker jq openssl-devel clang-devel llvm-devel
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose version

# Create custom Dockerfile for ARM compatibility
cat > Dockerfile << 'EOF'
FROM ethpandaops/ethereum-genesis-generator:4.0.4

# Remove the problematic jq binary
RUN rm -f /usr/local/bin/jq

# Install jq package that's compatible with ARM64
RUN apt-get update && apt-get install -y jq

# Set QEMU emulation flag for any remaining x86_64 binaries
ENV EXPERIMENTAL_DOCKER_DESKTOP_FORCE_QEMU=1
EOF

# Build the custom image
docker build -t custom-ethereum-genesis-generator:arm64 .
```


```diff
src/blockscout/blockscout_launcher.star

- IMAGE_NAME_BLOCKSCOUT_VERIF = "ghcr.io/blockscout/smart-contract-verifier:v1.9.0"
+ IMAGE_NAME_BLOCKSCOUT_VERIF = "ghcr.io/blockscout/smart-contract-verifier:v1.9.0-arm"
```

```yaml
optimism_package:
  chains:
    - participants:
        - el_type: op-geth
          cl_type: op-node
      network_params:
        fjord_time_offset: 0
        granite_time_offset: 0
        holocene_time_offset: 0
      additional_services:
        - blockscout
      proxyd_params:
        image: custom-proxyd:arm64
ethereum_package:
  participants:
    - el_type: geth
    - el_type: reth
  network_params:
    preset: minimal
    additional_preloaded_contracts: '
      {
        "0x4e59b44847b379578588920cA78FbF26c0B4956C": {
          "balance": "0ETH",
          "code": "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3",
          "storage": {},
          "nonce": "1"
        }
      }
    '
  additional_services:
    - blockscout
  ethereum_genesis_generator_params:
    image: custom-ethereum-genesis-generator:arm64
```

## Testing the Network

```bash
# Test L1 RPC
curl http://localhost:32793 \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"method":"eth_chainId","params":[],"id":1,"jsonrpc":"2.0"}'

# Test L1 balance
curl $L1_RPC \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"method":"eth_getBalance","params":["0x4e59b44847b379578588920cA78FbF26c0B4956C", "latest"],"id":1,"jsonrpc":"2.0"}'
```

## Environment Variables

### op-succinct

Set up your environment variables:

```bash
# TODO: figure out how to use 127.0.0.1, otherwise these have to be `host.docker.internal` for the docker container to access the host machine
# change to 127.0.0.1 if you're running some scripts locally
L1_RPC=http://host.docker.internal:32773
L2_RPC=http://host.docker.internal:32782
L1_BEACON_RPC=http://host.docker.internal:32776
L2_NODE_RPC=http://host.docker.internal:32785
PRIVATE_KEY=<l1 private key>
NETWORK_PRIVATE_KEY=<succinct private key>
```

## Architecture Details

The project implements a ZK rollup architecture with the following components:

1. **Sequencer**: Processes and orders EVM transactions
2. **op-succinct**: Handles EVM execution and proof generation
3. **Data Availability Layer**: Uses Celestia for storing transaction data
4. **Mina zkApp**: Verifies proofs and maintains the canonical state

For more detailed information about the architecture and implementation, please refer to the [blog post](blog_post.md).

## Dependencies

- `op-succinct`: zkEVM implementation for the OP Stack
- `Nori-zk`: SP1 PLONK to Kimchi proof converter
- `sp1`: Prover Network for proof generation
- `Celestia`: Data availability layer

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

MIT