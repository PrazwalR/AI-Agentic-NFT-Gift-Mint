// src/index.ts
import { DirectClient } from "@elizaos/client-direct";
import {
  AgentRuntime,
  elizaLogger as elizaLogger7,
  settings as settings3,
  stringToUuid as stringToUuid5
} from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { createNodePlugin } from "@elizaos/plugin-node";

// src/custom-plugins/providers/wallet.ts
import { createPublicClient, createWalletClient, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  elizaLogger
} from "@elizaos/core";
import * as viemChains from "viem/chains";
import NodeCache from "node-cache";
import * as path from "path";
var WalletProvider = class _WalletProvider {
  constructor(accountOrPrivateKey, cacheManager, chains) {
    this.cacheManager = cacheManager;
    if (typeof accountOrPrivateKey === "string") {
      this.account = privateKeyToAccount(accountOrPrivateKey);
    } else {
      this.account = accountOrPrivateKey;
    }
    this.setChains(chains);
    if (chains && Object.keys(chains).length > 0) {
      this.setCurrentChain(Object.keys(chains)[0]);
    }
    this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
  }
  cache;
  cacheKey = "evm/wallet";
  currentChain = "mainnet";
  CACHE_EXPIRY_SEC = 5;
  chains = { mainnet: viemChains.mainnet };
  account;
  getAddress() {
    return this.account.address;
  }
  getCurrentChain() {
    return this.chains[this.currentChain];
  }
  getPublicClient(chainName) {
    const transport = this.createHttpTransport(chainName);
    const publicClient = createPublicClient({
      chain: this.chains[chainName],
      transport
    });
    return publicClient;
  }
  getWalletClient(chainName) {
    const transport = this.createHttpTransport(chainName);
    const walletClient = createWalletClient({
      chain: this.chains[chainName],
      transport,
      account: this.account
    });
    return walletClient;
  }
  getChainConfigs(chainName) {
    const chain = viemChains[chainName];
    if (!chain?.id) {
      throw new Error("Invalid chain name");
    }
    return chain;
  }
  async getWalletBalance() {
    const cacheKey = "walletBalance_" + this.currentChain;
    const cachedData = await this.getCachedData(cacheKey);
    if (cachedData) {
      elizaLogger.log("Returning cached wallet balance for chain: " + this.currentChain);
      return cachedData;
    }
    try {
      const client = this.getPublicClient(this.currentChain);
      const balance = await client.getBalance({
        address: this.account.address
      });
      const balanceFormatted = formatUnits(balance, 18);
      this.setCachedData(cacheKey, balanceFormatted);
      elizaLogger.log("Wallet balance cached for chain: ", this.currentChain);
      return balanceFormatted;
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      return null;
    }
  }
  async getWalletBalanceForChain(chainName) {
    try {
      const client = this.getPublicClient(chainName);
      const balance = await client.getBalance({
        address: this.account.address
      });
      return formatUnits(balance, 18);
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      return null;
    }
  }
  addChain(chain) {
    this.setChains(chain);
  }
  switchChain(chainName, customRpcUrl) {
    if (!this.chains[chainName]) {
      const chain = _WalletProvider.genChainFromName(chainName, customRpcUrl);
      this.addChain({ [chainName]: chain });
    }
    this.setCurrentChain(chainName);
  }
  async readFromCache(key) {
    const cached = await this.cacheManager.get(path.join(this.cacheKey, key));
    return cached ?? null;
  }
  async writeToCache(key, data) {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + this.CACHE_EXPIRY_SEC * 1e3
    });
  }
  async getCachedData(key) {
    const cachedData = this.cache.get(key);
    if (cachedData) {
      return cachedData;
    }
    const fileCachedData = await this.readFromCache(key);
    if (fileCachedData) {
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }
    return null;
  }
  async setCachedData(cacheKey, data) {
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }
  setAccount = (accountOrPrivateKey) => {
    if (typeof accountOrPrivateKey === "string") {
      this.account = privateKeyToAccount(accountOrPrivateKey);
    } else {
      this.account = accountOrPrivateKey;
    }
  };
  setChains = (chains) => {
    if (!chains) {
      return;
    }
    Object.keys(chains).forEach((chain) => {
      this.chains[chain] = chains[chain];
    });
  };
  setCurrentChain = (chain) => {
    this.currentChain = chain;
  };
  createHttpTransport = (chainName) => {
    const chain = this.chains[chainName];
    if (chain.rpcUrls.custom) {
      return http(chain.rpcUrls.custom.http[0]);
    }
    return http(chain.rpcUrls.default.http[0]);
  };
  static genChainFromName(chainName, customRpcUrl) {
    const baseChain = viemChains[chainName];
    if (!baseChain?.id) {
      throw new Error("Invalid chain name");
    }
    const viemChain = customRpcUrl ? {
      ...baseChain,
      rpcUrls: {
        ...baseChain.rpcUrls,
        custom: {
          http: [customRpcUrl]
        }
      }
    } : baseChain;
    return viemChain;
  }
};
var genChainsFromRuntime = (runtime) => {
  const chainNames = runtime.character.settings?.chains?.evm || [];
  const chains = {};
  chainNames.forEach((chainName) => {
    const rpcUrl = runtime.getSetting("ETHEREUM_PROVIDER_" + chainName.toUpperCase());
    const chain = WalletProvider.genChainFromName(chainName, rpcUrl);
    chains[chainName] = chain;
  });
  const mainnet_rpcurl = runtime.getSetting("EVM_PROVIDER_URL");
  if (mainnet_rpcurl) {
    const chain = WalletProvider.genChainFromName("mainnet", mainnet_rpcurl);
    chains["mainnet"] = chain;
  }
  return chains;
};
var initWalletProvider = async (runtime) => {
  const chains = genChainsFromRuntime(runtime);
  const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("EVM_PRIVATE_KEY is missing");
  }
  if (!privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY must start with 0x");
  }
  return new WalletProvider(privateKey, runtime.cacheManager, chains);
};
var evmWalletProvider = {
  async get(runtime, _message, state) {
    try {
      const walletProvider = await initWalletProvider(runtime);
      const address = walletProvider.getAddress();
      const balance = await walletProvider.getWalletBalance();
      const chain = walletProvider.getCurrentChain();
      const agentName = state?.agentName || "The agent";
      return `${agentName}'s EVM Wallet Address: ${address}
Balance: ${balance} ${chain.nativeCurrency.symbol}
Chain ID: ${chain.id}, Name: ${chain.name}`;
    } catch (error) {
      console.error("Error in EVM wallet provider:", error);
      return null;
    }
  }
};

// src/custom-plugins/types/index.ts
import * as viemChains2 from "viem/chains";
var _SupportedChainList = Object.keys(viemChains2);

// src/custom-plugins/actions/getGift.ts
import { formatEther, parseEther, getContract } from "viem";
import {
  composeContext,
  generateObjectDeprecated,
  ModelClass
} from "@elizaos/core";

// src/custom-plugins/templates/index.ts
var getGiftTemplate = `You are an AI assistant specialized in processing smart contract function call requests. Your task is to extract specific information from user messages and format it into a structured JSON response.

First, review the recent messages from the conversation:

<recent_messages>
{{recentMessages}}
</recent_messages>

Your goal is to extract the following information about the requested transfer:
1. Gift code, this is a string with numbers and characters
2. Wallet address, this is ethereum wallet address with 42 characters, always starts with 0x.

Example: You may get the input that looks like 'my wallet address is my wallet address is 0x208aa722aca42399eac5192ee778e4d42f4e5de3 and my gift code is Nbbut8vlkKe9991Z4Z4.  Please send me a gift and my gift code is Nbbut8vlkKe9991Z4Z4.  Please send me a gift'
From this you will extract the wallet address which is 0x208aa722aca42399eac5192ee778e4d42f4e5de3 and the gift code is Nbbut8vlkKe9991Z4Z4.

You must extract that data into JSON using the structure below. 

Before providing the final JSON output, show your reasoning process inside <analysis> tags. Follow these steps:

1. Identify the relevant information from the user's message:
   - Quote the part of the message mentioning the gift code or code.
   - Quote the part mentioning the wallet address. They may simply refer to it as "address".

2. Validate each piece of information:
   - Code: check if the code is a string that contains number and characters.
   - Address: Check that it starts with "0x" and count the number of characters (should be 42).

3. If any information is missing or invalid, prepare an appropriate error message.

4. If all information is valid, summarize your findings.

5. Prepare the JSON structure based on your analysis.

After your analysis, provide the final output in a JSON markdown block. All fields except 'token' are required. The JSON should have this structure:

\`\`\`json
{
    "code": string,
    "address": string,
}
\`\`\`

Remember:
- The gift code must be a string with number and characters.
- The wallet address must be a valid Ethereum address starting with "0x".

Now, process the user's request and provide your response.
`;

// src/custom-plugins/artifacts/GetGift.json
var GetGift_default = {
  contracts: {
    "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol:FunctionsClient": {
      abi: [
        { inputs: [], name: "OnlyRouterCanFulfill", type: "error" },
        {
          anonymous: false,
          inputs: [{ indexed: true, internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "RequestFulfilled",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: true, internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "RequestSent",
          type: "event"
        },
        {
          inputs: [
            { internalType: "bytes32", name: "requestId", type: "bytes32" },
            { internalType: "bytes", name: "response", type: "bytes" },
            { internalType: "bytes", name: "err", type: "bytes" }
          ],
          name: "handleOracleFulfillment",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol:IFunctionsClient": {
      abi: [
        {
          inputs: [
            { internalType: "bytes32", name: "requestId", type: "bytes32" },
            { internalType: "bytes", name: "response", type: "bytes" },
            { internalType: "bytes", name: "err", type: "bytes" }
          ],
          name: "handleOracleFulfillment",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsRouter.sol:IFunctionsRouter": {
      abi: [
        {
          inputs: [
            { internalType: "bytes", name: "response", type: "bytes" },
            { internalType: "bytes", name: "err", type: "bytes" },
            { internalType: "uint96", name: "juelsPerGas", type: "uint96" },
            { internalType: "uint96", name: "costWithoutFulfillment", type: "uint96" },
            { internalType: "address", name: "transmitter", type: "address" },
            {
              components: [
                { internalType: "bytes32", name: "requestId", type: "bytes32" },
                { internalType: "address", name: "coordinator", type: "address" },
                { internalType: "uint96", name: "estimatedTotalCostJuels", type: "uint96" },
                { internalType: "address", name: "client", type: "address" },
                { internalType: "uint64", name: "subscriptionId", type: "uint64" },
                { internalType: "uint32", name: "callbackGasLimit", type: "uint32" },
                { internalType: "uint72", name: "adminFee", type: "uint72" },
                { internalType: "uint72", name: "donFee", type: "uint72" },
                { internalType: "uint40", name: "gasOverheadBeforeCallback", type: "uint40" },
                { internalType: "uint40", name: "gasOverheadAfterCallback", type: "uint40" },
                { internalType: "uint32", name: "timeoutTimestamp", type: "uint32" }
              ],
              internalType: "struct FunctionsResponse.Commitment",
              name: "commitment",
              type: "tuple"
            }
          ],
          name: "fulfill",
          outputs: [
            { internalType: "enum FunctionsResponse.FulfillResult", name: "", type: "uint8" },
            { internalType: "uint96", name: "", type: "uint96" }
          ],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [],
          name: "getAdminFee",
          outputs: [{ internalType: "uint72", name: "adminFee", type: "uint72" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "getAllowListId",
          outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "getContractById",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "getProposedContractById",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "getProposedContractSet",
          outputs: [
            { internalType: "bytes32[]", name: "", type: "bytes32[]" },
            { internalType: "address[]", name: "", type: "address[]" }
          ],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "uint64", name: "subscriptionId", type: "uint64" },
            { internalType: "uint32", name: "callbackGasLimit", type: "uint32" }
          ],
          name: "isValidCallbackGasLimit",
          outputs: [],
          stateMutability: "view",
          type: "function"
        },
        { inputs: [], name: "pause", outputs: [], stateMutability: "nonpayable", type: "function" },
        {
          inputs: [
            { internalType: "bytes32[]", name: "proposalSetIds", type: "bytes32[]" },
            { internalType: "address[]", name: "proposalSetAddresses", type: "address[]" }
          ],
          name: "proposeContractsUpdate",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "uint64", name: "subscriptionId", type: "uint64" },
            { internalType: "bytes", name: "data", type: "bytes" },
            { internalType: "uint16", name: "dataVersion", type: "uint16" },
            { internalType: "uint32", name: "callbackGasLimit", type: "uint32" },
            { internalType: "bytes32", name: "donId", type: "bytes32" }
          ],
          name: "sendRequest",
          outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "uint64", name: "subscriptionId", type: "uint64" },
            { internalType: "bytes", name: "data", type: "bytes" },
            { internalType: "uint16", name: "dataVersion", type: "uint16" },
            { internalType: "uint32", name: "callbackGasLimit", type: "uint32" },
            { internalType: "bytes32", name: "donId", type: "bytes32" }
          ],
          name: "sendRequestToProposed",
          outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes32", name: "allowListId", type: "bytes32" }],
          name: "setAllowListId",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        { inputs: [], name: "unpause", outputs: [], stateMutability: "nonpayable", type: "function" },
        { inputs: [], name: "updateContracts", outputs: [], stateMutability: "nonpayable", type: "function" }
      ],
      bin: ""
    },
    "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol:FunctionsRequest": {
      abi: [
        { inputs: [], name: "EmptyArgs", type: "error" },
        { inputs: [], name: "EmptySecrets", type: "error" },
        { inputs: [], name: "EmptySource", type: "error" },
        { inputs: [], name: "NoInlineSecrets", type: "error" },
        {
          inputs: [],
          name: "REQUEST_DATA_VERSION",
          outputs: [{ internalType: "uint16", name: "", type: "uint16" }],
          stateMutability: "view",
          type: "function"
        }
      ],
      bin: "608c610038600b82828239805160001a607314602b57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe730000000000000000000000000000000000000000301460806040526004361060335760003560e01c80635d641dfc146038575b600080fd5b603f600181565b60405161ffff909116815260200160405180910390f3fea2646970667358221220ab9773f20b442a12cd9fc657e04d57c9fe402b99181c60a87e00483c531e9d3064736f6c63430008130033"
    },
    "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsResponse.sol:FunctionsResponse": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea2646970667358221220cec5475884462426b88dad98e220e8cf5724708eb83e018b6806626da6bf868464736f6c63430008130033"
    },
    "@chainlink/contracts/src/v0.8/vendor/@ensdomains/buffer/v0.1.0/Buffer.sol:Buffer": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea2646970667358221220d9c6db65378acaff3d75cc52653d3ba0bc60b1dd032363fab76b2ac8b48110ca64736f6c63430008130033"
    },
    "@chainlink/contracts/src/v0.8/vendor/solidity-cborutils/v2.0.0/CBOR.sol:CBOR": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea264697066735822122094036772b43a7bd8772ffc71b7ce9ddf0051de8635af28b32074e187eb39c57464736f6c63430008130033"
    },
    "@openzeppelin/contracts/interfaces/IERC4906.sol:IERC4906": {
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: false, internalType: "uint256", name: "_fromTokenId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "_toTokenId", type: "uint256" }
          ],
          name: "BatchMetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: false, internalType: "uint256", name: "_tokenId", type: "uint256" }],
          name: "MetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "operator", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "owner", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/token/ERC721/ERC721.sol:ERC721": {
      abi: [
        {
          inputs: [
            { internalType: "string", name: "name_", type: "string" },
            { internalType: "string", name: "symbol_", type: "string" }
          ],
          stateMutability: "nonpayable",
          type: "constructor"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "name",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "symbol",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: "60806040523480156200001157600080fd5b50604051620013e7380380620013e783398101604081905262000034916200011f565b600062000042838262000218565b50600162000051828262000218565b505050620002e4565b634e487b7160e01b600052604160045260246000fd5b600082601f8301126200008257600080fd5b81516001600160401b03808211156200009f576200009f6200005a565b604051601f8301601f19908116603f01168101908282118183101715620000ca57620000ca6200005a565b81604052838152602092508683858801011115620000e757600080fd5b600091505b838210156200010b5785820183015181830184015290820190620000ec565b600093810190920192909252949350505050565b600080604083850312156200013357600080fd5b82516001600160401b03808211156200014b57600080fd5b620001598683870162000070565b935060208501519150808211156200017057600080fd5b506200017f8582860162000070565b9150509250929050565b600181811c908216806200019e57607f821691505b602082108103620001bf57634e487b7160e01b600052602260045260246000fd5b50919050565b601f8211156200021357600081815260208120601f850160051c81016020861015620001ee5750805b601f850160051c820191505b818110156200020f57828155600101620001fa565b5050505b505050565b81516001600160401b038111156200023457620002346200005a565b6200024c8162000245845462000189565b84620001c5565b602080601f8311600181146200028457600084156200026b5750858301515b600019600386901b1c1916600185901b1785556200020f565b600085815260208120601f198616915b82811015620002b55788860151825594840194600190910190840162000294565b5085821015620002d45787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b6110f380620002f46000396000f3fe608060405234801561001057600080fd5b50600436106100cf5760003560e01c80636352211e1161008c578063a22cb46511610066578063a22cb465146101b3578063b88d4fde146101c6578063c87b56dd146101d9578063e985e9c5146101ec57600080fd5b80636352211e1461017757806370a082311461018a57806395d89b41146101ab57600080fd5b806301ffc9a7146100d457806306fdde03146100fc578063081812fc14610111578063095ea7b31461013c57806323b872dd1461015157806342842e0e14610164575b600080fd5b6100e76100e2366004610c7f565b610228565b60405190151581526020015b60405180910390f35b61010461027a565b6040516100f39190610cec565b61012461011f366004610cff565b61030c565b6040516001600160a01b0390911681526020016100f3565b61014f61014a366004610d34565b610333565b005b61014f61015f366004610d5e565b61044d565b61014f610172366004610d5e565b61047e565b610124610185366004610cff565b610499565b61019d610198366004610d9a565b6104f9565b6040519081526020016100f3565b61010461057f565b61014f6101c1366004610db5565b61058e565b61014f6101d4366004610e07565b61059d565b6101046101e7366004610cff565b6105d5565b6100e76101fa366004610ee3565b6001600160a01b03918216600090815260056020908152604080832093909416825291909152205460ff1690565b60006001600160e01b031982166380ac58cd60e01b148061025957506001600160e01b03198216635b5e139f60e01b145b8061027457506301ffc9a760e01b6001600160e01b03198316145b92915050565b60606000805461028990610f16565b80601f01602080910402602001604051908101604052809291908181526020018280546102b590610f16565b80156103025780601f106102d757610100808354040283529160200191610302565b820191906000526020600020905b8154815290600101906020018083116102e557829003601f168201915b5050505050905090565b600061031782610649565b506000908152600460205260409020546001600160a01b031690565b600061033e82610499565b9050806001600160a01b0316836001600160a01b0316036103b05760405162461bcd60e51b815260206004820152602160248201527f4552433732313a20617070726f76616c20746f2063757272656e74206f776e656044820152603960f91b60648201526084015b60405180910390fd5b336001600160a01b03821614806103cc57506103cc81336101fa565b61043e5760405162461bcd60e51b815260206004820152603d60248201527f4552433732313a20617070726f76652063616c6c6572206973206e6f7420746f60448201527f6b656e206f776e6572206f7220617070726f76656420666f7220616c6c00000060648201526084016103a7565b61044883836106ab565b505050565b6104573382610719565b6104735760405162461bcd60e51b81526004016103a790610f50565b610448838383610798565b6104488383836040518060200160405280600081525061059d565b6000818152600260205260408120546001600160a01b0316806102745760405162461bcd60e51b8152602060048201526018602482015277115490cdcc8c4e881a5b9d985b1a59081d1bdad95b88125160421b60448201526064016103a7565b60006001600160a01b0382166105635760405162461bcd60e51b815260206004820152602960248201527f4552433732313a2061646472657373207a65726f206973206e6f7420612076616044820152683634b21037bbb732b960b91b60648201526084016103a7565b506001600160a01b031660009081526003602052604090205490565b60606001805461028990610f16565b6105993383836108fc565b5050565b6105a73383610719565b6105c35760405162461bcd60e51b81526004016103a790610f50565b6105cf848484846109ca565b50505050565b60606105e082610649565b60006105f760408051602081019091526000815290565b905060008151116106175760405180602001604052806000815250610642565b80610621846109fd565b604051602001610632929190610f9d565b6040516020818303038152906040525b9392505050565b6000818152600260205260409020546001600160a01b03166106a85760405162461bcd60e51b8152602060048201526018602482015277115490cdcc8c4e881a5b9d985b1a59081d1bdad95b88125160421b60448201526064016103a7565b50565b600081815260046020526040902080546001600160a01b0319166001600160a01b03841690811790915581906106e082610499565b6001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b60008061072583610499565b9050806001600160a01b0316846001600160a01b0316148061076c57506001600160a01b0380821660009081526005602090815260408083209388168352929052205460ff165b806107905750836001600160a01b03166107858461030c565b6001600160a01b0316145b949350505050565b826001600160a01b03166107ab82610499565b6001600160a01b0316146107d15760405162461bcd60e51b81526004016103a790610fcc565b6001600160a01b0382166108335760405162461bcd60e51b8152602060048201526024808201527f4552433732313a207472616e7366657220746f20746865207a65726f206164646044820152637265737360e01b60648201526084016103a7565b826001600160a01b031661084682610499565b6001600160a01b03161461086c5760405162461bcd60e51b81526004016103a790610fcc565b600081815260046020908152604080832080546001600160a01b03199081169091556001600160a01b0387811680865260038552838620805460001901905590871680865283862080546001019055868652600290945282852080549092168417909155905184937fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef91a4505050565b816001600160a01b0316836001600160a01b03160361095d5760405162461bcd60e51b815260206004820152601960248201527f4552433732313a20617070726f766520746f2063616c6c65720000000000000060448201526064016103a7565b6001600160a01b03838116600081815260056020908152604080832094871680845294825291829020805460ff191686151590811790915591519182527f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31910160405180910390a3505050565b6109d5848484610798565b6109e184848484610a90565b6105cf5760405162461bcd60e51b81526004016103a790611011565b60606000610a0a83610b91565b600101905060008167ffffffffffffffff811115610a2a57610a2a610df1565b6040519080825280601f01601f191660200182016040528015610a54576020820181803683370190505b5090508181016020015b600019016f181899199a1a9b1b9c1cb0b131b232b360811b600a86061a8153600a8504945084610a5e57509392505050565b60006001600160a01b0384163b15610b8657604051630a85bd0160e11b81526001600160a01b0385169063150b7a0290610ad4903390899088908890600401611063565b6020604051808303816000875af1925050508015610b0f575060408051601f3d908101601f19168201909252610b0c918101906110a0565b60015b610b6c573d808015610b3d576040519150601f19603f3d011682016040523d82523d6000602084013e610b42565b606091505b508051600003610b645760405162461bcd60e51b81526004016103a790611011565b805181602001fd5b6001600160e01b031916630a85bd0160e11b149050610790565b506001949350505050565b60008072184f03e93ff9f4daa797ed6e38ed64bf6a1f0160401b8310610bd05772184f03e93ff9f4daa797ed6e38ed64bf6a1f0160401b830492506040015b6d04ee2d6d415b85acef81000000008310610bfc576d04ee2d6d415b85acef8100000000830492506020015b662386f26fc100008310610c1a57662386f26fc10000830492506010015b6305f5e1008310610c32576305f5e100830492506008015b6127108310610c4657612710830492506004015b60648310610c58576064830492506002015b600a83106102745760010192915050565b6001600160e01b0319811681146106a857600080fd5b600060208284031215610c9157600080fd5b813561064281610c69565b60005b83811015610cb7578181015183820152602001610c9f565b50506000910152565b60008151808452610cd8816020860160208601610c9c565b601f01601f19169290920160200192915050565b6020815260006106426020830184610cc0565b600060208284031215610d1157600080fd5b5035919050565b80356001600160a01b0381168114610d2f57600080fd5b919050565b60008060408385031215610d4757600080fd5b610d5083610d18565b946020939093013593505050565b600080600060608486031215610d7357600080fd5b610d7c84610d18565b9250610d8a60208501610d18565b9150604084013590509250925092565b600060208284031215610dac57600080fd5b61064282610d18565b60008060408385031215610dc857600080fd5b610dd183610d18565b915060208301358015158114610de657600080fd5b809150509250929050565b634e487b7160e01b600052604160045260246000fd5b60008060008060808587031215610e1d57600080fd5b610e2685610d18565b9350610e3460208601610d18565b925060408501359150606085013567ffffffffffffffff80821115610e5857600080fd5b818701915087601f830112610e6c57600080fd5b813581811115610e7e57610e7e610df1565b604051601f8201601f19908116603f01168101908382118183101715610ea657610ea6610df1565b816040528281528a6020848701011115610ebf57600080fd5b82602086016020830137600060208483010152809550505050505092959194509250565b60008060408385031215610ef657600080fd5b610eff83610d18565b9150610f0d60208401610d18565b90509250929050565b600181811c90821680610f2a57607f821691505b602082108103610f4a57634e487b7160e01b600052602260045260246000fd5b50919050565b6020808252602d908201527f4552433732313a2063616c6c6572206973206e6f7420746f6b656e206f776e6560408201526c1c881bdc88185c1c1c9bdd9959609a1b606082015260800190565b60008351610faf818460208801610c9c565b835190830190610fc3818360208801610c9c565b01949350505050565b60208082526025908201527f4552433732313a207472616e736665722066726f6d20696e636f72726563742060408201526437bbb732b960d91b606082015260800190565b60208082526032908201527f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560408201527131b2b4bb32b91034b6b83632b6b2b73a32b960711b606082015260800190565b6001600160a01b038581168252841660208201526040810183905260806060820181905260009061109690830184610cc0565b9695505050505050565b6000602082840312156110b257600080fd5b815161064281610c6956fea264697066735822122046232d695729941dc3c66a3841f05c2a778545995d243b77b3f4721d3f05ed1564736f6c63430008130033"
    },
    "@openzeppelin/contracts/token/ERC721/IERC721.sol:IERC721": {
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "operator", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "owner", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol:IERC721Receiver": {
      abi: [
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "address", name: "from", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "onERC721Received",
          outputs: [{ internalType: "bytes4", name: "", type: "bytes4" }],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol:ERC721URIStorage": {
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: false, internalType: "uint256", name: "_fromTokenId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "_toTokenId", type: "uint256" }
          ],
          name: "BatchMetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: false, internalType: "uint256", name: "_tokenId", type: "uint256" }],
          name: "MetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "name",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "symbol",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol:IERC721Metadata": {
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "balance", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "operator", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "name",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "owner", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "symbol",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/utils/Address.sol:Address": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea26469706673582212206a5ffe3918ffd67bc8201cd7c53cdf8cf8012872ab683529e81e227957132c4364736f6c63430008130033"
    },
    "@openzeppelin/contracts/utils/Context.sol:Context": { abi: [], bin: "" },
    "@openzeppelin/contracts/utils/Strings.sol:Strings": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea264697066735822122011d4b54bc80c0b44d0162d73c9c1dba9b336560313d5935c1ed2a4804e8673e864736f6c63430008130033"
    },
    "@openzeppelin/contracts/utils/introspection/ERC165.sol:ERC165": {
      abi: [
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/utils/introspection/IERC165.sol:IERC165": {
      abi: [
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        }
      ],
      bin: ""
    },
    "@openzeppelin/contracts/utils/math/Math.sol:Math": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea2646970667358221220e91d0b72d0ff009b3ea09e6b95963bbe902271bfde10f6c03cf48d240255864664736f6c63430008130033"
    },
    "@openzeppelin/contracts/utils/math/SignedMath.sol:SignedMath": {
      abi: [],
      bin: "60566037600b82828239805160001a607314602a57634e487b7160e01b600052600060045260246000fd5b30600052607381538281f3fe73000000000000000000000000000000000000000030146080604052600080fdfea264697066735822122088366b59ea99732082b3124288e8358f874708936e6768c5650b9be28fa19db664736f6c63430008130033"
    },
    "GetGift.sol:GetGift": {
      abi: [
        { inputs: [], stateMutability: "nonpayable", type: "constructor" },
        { inputs: [], name: "EmptyArgs", type: "error" },
        { inputs: [], name: "EmptySource", type: "error" },
        { inputs: [], name: "NoInlineSecrets", type: "error" },
        { inputs: [], name: "OnlyRouterCanFulfill", type: "error" },
        {
          inputs: [{ internalType: "bytes32", name: "requestId", type: "bytes32" }],
          name: "UnexpectedRequestID",
          type: "error"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "approved", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Approval",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "owner", type: "address" },
            { indexed: true, internalType: "address", name: "operator", type: "address" },
            { indexed: false, internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "ApprovalForAll",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: false, internalType: "uint256", name: "_fromTokenId", type: "uint256" },
            { indexed: false, internalType: "uint256", name: "_toTokenId", type: "uint256" }
          ],
          name: "BatchMetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: false, internalType: "uint256", name: "_tokenId", type: "uint256" }],
          name: "MetadataUpdate",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: true, internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "RequestFulfilled",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [{ indexed: true, internalType: "bytes32", name: "id", type: "bytes32" }],
          name: "RequestSent",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "bytes32", name: "requestId", type: "bytes32" },
            { indexed: false, internalType: "bytes", name: "response", type: "bytes" },
            { indexed: false, internalType: "bytes", name: "err", type: "bytes" }
          ],
          name: "Response",
          type: "event"
        },
        {
          anonymous: false,
          inputs: [
            { indexed: true, internalType: "address", name: "from", type: "address" },
            { indexed: true, internalType: "address", name: "to", type: "address" },
            { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "Transfer",
          type: "event"
        },
        {
          inputs: [],
          name: "CALLBACK_GAS_LIMIT",
          outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "DON_ID",
          outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "ROUTER_ADDR",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "SOURCE",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "string", name: "giftName", type: "string" },
            { internalType: "string", name: "_tokenUri", type: "string" }
          ],
          name: "addGift",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "addrToAdd", type: "address" }],
          name: "addToAllowList",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "approve",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "address", name: "owner", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "getApproved",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "bytes32", name: "requestId", type: "bytes32" },
            { internalType: "bytes", name: "response", type: "bytes" },
            { internalType: "bytes", name: "err", type: "bytes" }
          ],
          name: "handleOracleFulfillment",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "operator", type: "address" }
          ],
          name: "isApprovedForAll",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "name",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "removeFromAllowList",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [],
          name: "result",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "s_lastError",
          outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "s_lastRequestId",
          outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "s_lastResponse",
          outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
            { internalType: "bytes", name: "data", type: "bytes" }
          ],
          name: "safeTransferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "uint8", name: "donHostedSecretsSlotID", type: "uint8" },
            { internalType: "uint64", name: "donHostedSecretsVersion", type: "uint64" },
            { internalType: "string[]", name: "args", type: "string[]" },
            { internalType: "uint64", name: "subscriptionId", type: "uint64" },
            { internalType: "address", name: "userAddr", type: "address" }
          ],
          name: "sendRequest",
          outputs: [{ internalType: "bytes32", name: "requestId", type: "bytes32" }],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "operator", type: "address" },
            { internalType: "bool", name: "approved", type: "bool" }
          ],
          name: "setApprovalForAll",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        },
        {
          inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
          name: "supportsInterface",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "symbol",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [],
          name: "tokenId",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ internalType: "string", name: "", type: "string" }],
          stateMutability: "view",
          type: "function"
        },
        {
          inputs: [
            { internalType: "address", name: "from", type: "address" },
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" }
          ],
          name: "transferFrom",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }
      ],
      bin: "60e0604052600c60a09081526b0c4c0c08191a5cd8dbdd5b9d60a21b60c0526011906200002d9082620002b6565b5060408051808201909152600b81526a0d4c08191a5cd8dbdd5b9d60aa1b60208201526012906200005f9082620002b6565b5060408051808201909152600f81526e312d6d6f6e7468207072656d69756d60881b6020820152601390620000959082620002b6565b50348015620000a357600080fd5b50604080518082018252600481526311da599d60e21b6020808301919091528251808401909352600283526111d560f21b9083015273a9d587a00a31a52ed70d6026794a8fc5e2f5dcb0608052906000620000ff8382620002b6565b5060016200010e8282620002b6565b5050336000908152600b6020908152604091829020805460ff191660011790558151606081019092526035808352919250620033ac90830139601060116040516200015a919062000382565b90815260200160405180910390209081620001769190620002b6565b50604051806060016040528060358152602001620033776035913960106012604051620001a4919062000382565b90815260200160405180910390209081620001c09190620002b6565b50604051806060016040528060358152602001620033e16035913960106013604051620001ee919062000382565b908152602001604051809103902090816200020a9190620002b6565b5062000400565b634e487b7160e01b600052604160045260246000fd5b600181811c908216806200023c57607f821691505b6020821081036200025d57634e487b7160e01b600052602260045260246000fd5b50919050565b601f821115620002b157600081815260208120601f850160051c810160208610156200028c5750805b601f850160051c820191505b81811015620002ad5782815560010162000298565b5050505b505050565b81516001600160401b03811115620002d257620002d262000211565b620002ea81620002e3845462000227565b8462000263565b602080601f831160018114620003225760008415620003095750858301515b600019600386901b1c1916600185901b178555620002ad565b600085815260208120601f198616915b82811015620003535788860151825594840194600190910190840162000332565b5085821015620003725787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b6000808354620003928162000227565b60018281168015620003ad5760018114620003c357620003f4565b60ff1984168752821515830287019450620003f4565b8760005260208060002060005b85811015620003eb5781548a820152908401908201620003d0565b50505082870194505b50929695505050505050565b608051612f5462000423600039600081816105c0015261157f0152612f546000f3fe608060405234801561001057600080fd5b50600436106101a95760003560e01c806342842e0e116100f957806395d89b4111610097578063b88d4fde11610071578063b88d4fde14610376578063c87b56dd14610389578063e985e9c51461039c578063f230b4c2146103af57600080fd5b806395d89b4114610352578063a22cb4651461035a578063b1e217491461036d57600080fd5b80636352211e116100d35780636352211e1461031c578063653721471461032f57806370a082311461033757806382bb0dfc1461034a57600080fd5b806342842e0e146102ee5780634b0795a81461030157806358875a4f1461030957600080fd5b8063134d67e5116101665780632d00cf3b116101405780632d00cf3b146102a157806331f59102146102b457806333d608f1146102c75780633944ea3a146102e657600080fd5b8063134d67e51461026a57806317d70f7c1461028557806323b872dd1461028e57600080fd5b806301ffc9a7146101ae57806306fdde03146101d6578063081812fc146101eb578063095ea7b3146102165780630ca761751461022b5780630cde9f3c1461023e575b600080fd5b6101c16101bc366004612232565b6103b7565b60405190151581526020015b60405180910390f35b6101de6103e2565b6040516101cd919061229f565b6101fe6101f93660046122b2565b610474565b6040516001600160a01b0390911681526020016101cd565b6102296102243660046122e7565b61049b565b005b6102296102393660046123c6565b6105b5565b61025c7366756e2d6176616c616e6368652d66756a692d3160601b81565b6040519081526020016101cd565b6101fe73a9d587a00a31a52ed70d6026794a8fc5e2f5dcb081565b61025c600f5481565b61022961029c366004612432565b610639565b6102296102af36600461246e565b61066a565b6102296102c23660046124d1565b6106c4565b6102d1620493e081565b60405163ffffffff90911681526020016101cd565b6101de610717565b6102296102fc366004612432565b6107a5565b6101de6107c0565b61025c610317366004612503565b6107cd565b6101fe61032a3660046122b2565b610995565b6101de6109f5565b61025c6103453660046124d1565b610a02565b610229610a88565b6101de610ad0565b610229610368366004612612565b610adf565b61025c60075481565b61022961038436600461264e565b610aee565b6101de6103973660046122b2565b610b26565b6101c16103aa3660046126b5565b610c36565b6101de610c64565b60006001600160e01b03198216632483248360e11b14806103dc57506103dc82610c83565b92915050565b6060600080546103f1906126e8565b80601f016020809104026020016040519081016040528092919081815260200182805461041d906126e8565b801561046a5780601f1061043f5761010080835404028352916020019161046a565b820191906000526020600020905b81548152906001019060200180831161044d57829003601f168201915b5050505050905090565b600061047f82610cd3565b506000908152600460205260409020546001600160a01b031690565b60006104a682610995565b9050806001600160a01b0316836001600160a01b0316036105185760405162461bcd60e51b815260206004820152602160248201527f4552433732313a20617070726f76616c20746f2063757272656e74206f776e656044820152603960f91b60648201526084015b60405180910390fd5b336001600160a01b038216148061053457506105348133610c36565b6105a65760405162461bcd60e51b815260206004820152603d60248201527f4552433732313a20617070726f76652063616c6c6572206973206e6f7420746f60448201527f6b656e206f776e6572206f7220617070726f76656420666f7220616c6c000000606482015260840161050f565b6105b08383610d35565b505050565b336001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016146105fe5760405163c6829f8360e01b815260040160405180910390fd5b610609838383610da3565b60405183907f85e1543bf2f84fe80c6badbce3648c8539ad1df4d2b3d822938ca0538be727e690600090a2505050565b6106433382611013565b61065f5760405162461bcd60e51b815260040161050f90612722565b6105b0838383611071565b336000908152600b602052604090205460ff166106995760405162461bcd60e51b815260040161050f9061276f565b806010836040516106aa91906127be565b908152602001604051809103902090816105b09190612828565b336000908152600b602052604090205460ff166106f35760405162461bcd60e51b815260040161050f9061276f565b6001600160a01b03166000908152600b60205260409020805460ff19166001179055565b60088054610724906126e8565b80601f0160208091040260200160405190810160405280929190818152602001828054610750906126e8565b801561079d5780601f106107725761010080835404028352916020019161079d565b820191906000526020600020905b81548152906001019060200180831161078057829003601f168201915b505050505081565b6105b083838360405180602001604052806000815250610aee565b60098054610724906126e8565b336000908152600b602052604081205460ff166107fc5760405162461bcd60e51b815260040161050f9061276f565b600084600081518110610811576108116128e7565b60200260200101519050600c8160405161082b91906127be565b9081526040519081900360200190205460ff16156108825760405162461bcd60e51b81526020600482015260146024820152731d1a194818dbd919481a5cc81c995919595b595960621b604482015260640161050f565b6108c36040805160e0810190915280600081526020016000815260200160008152602001606081526020016060815260200160608152602001606081525090565b6108e96040518061028001604052806102608152602001612cbf610260913982906111d5565b6001600160401b03871615610903576109038189896111e2565b855115610914576109148187611278565b610942610920826112a2565b86620493e07366756e2d6176616c616e6368652d66756a692d3160601b61157a565b60078181556000918252600d6020908152604080842080546001600160a01b0319166001600160a01b038a1617905591548352600e905290206109858382612828565b5050600754979650505050505050565b6000818152600260205260408120546001600160a01b0316806103dc5760405162461bcd60e51b8152602060048201526018602482015277115490cdcc8c4e881a5b9d985b1a59081d1bdad95b88125160421b604482015260640161050f565b600a8054610724906126e8565b60006001600160a01b038216610a6c5760405162461bcd60e51b815260206004820152602960248201527f4552433732313a2061646472657373207a65726f206973206e6f7420612076616044820152683634b21037bbb732b960b91b606482015260840161050f565b506001600160a01b031660009081526003602052604090205490565b336000908152600b602052604090205460ff16610ab75760405162461bcd60e51b815260040161050f9061276f565b336000908152600b60205260409020805460ff19169055565b6060600180546103f1906126e8565b610aea33838361164c565b5050565b610af83383611013565b610b145760405162461bcd60e51b815260040161050f90612722565b610b208484848461171a565b50505050565b6060610b3182610cd3565b60008281526006602052604081208054610b4a906126e8565b80601f0160208091040260200160405190810160405280929190818152602001828054610b76906126e8565b8015610bc35780601f10610b9857610100808354040283529160200191610bc3565b820191906000526020600020905b815481529060010190602001808311610ba657829003601f168201915b505050505090506000610be160408051602081019091526000815290565b90508051600003610bf3575092915050565b815115610c25578082604051602001610c0d9291906128fd565b60405160208183030381529060405292505050919050565b610c2e8461174d565b949350505050565b6001600160a01b03918216600090815260056020908152604080832093909416825291909152205460ff1690565b6040518061028001604052806102608152602001612cbf610260913981565b60006001600160e01b031982166380ac58cd60e01b1480610cb457506001600160e01b03198216635b5e139f60e01b145b806103dc57506301ffc9a760e01b6001600160e01b03198316146103dc565b6000818152600260205260409020546001600160a01b0316610d325760405162461bcd60e51b8152602060048201526018602482015277115490cdcc8c4e881a5b9d985b1a59081d1bdad95b88125160421b604482015260640161050f565b50565b600081815260046020526040902080546001600160a01b0319166001600160a01b0384169081179091558190610d6a82610995565b6001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b8260075414610dc85760405163d068bf5b60e01b81526004810184905260240161050f565b6008610dd48382612828565b506009610de18282612828565b50827f7873807bf6ddc50401cd3d29bbe0decee23fd4d68d273f4b5eb83cded4d2f17260086009604051610e169291906129a9565b60405180910390a26040805180820190915260098152681b9bdd08199bdd5b9960ba1b6020918201528251908301207f6477830223bcb1c30be49996abece5039ee477f389c85539935e09d60767b3a501610e7057505050565b6000838152600d60205260408082205490516001600160a01b039091169190601090610e9d9086906127be565b90815260200160405180910390208054610eb6906126e8565b80601f0160208091040260200160405190810160405280929190818152602001828054610ee2906126e8565b8015610f2f5780601f10610f0457610100808354040283529160200191610f2f565b820191906000526020600020905b815481529060010190602001808311610f1257829003601f168201915b50505050509050610f4082826117c1565b6000858152600e602052604081208054610f59906126e8565b80601f0160208091040260200160405190810160405280929190818152602001828054610f85906126e8565b8015610fd25780601f10610fa757610100808354040283529160200191610fd2565b820191906000526020600020905b815481529060010190602001808311610fb557829003601f168201915b505050505090506001600c82604051610feb91906127be565b908152604051908190036020019020805491151560ff19909216919091179055505050505050565b60008061101f83610995565b9050806001600160a01b0316846001600160a01b0316148061104657506110468185610c36565b80610c2e5750836001600160a01b031661105f84610474565b6001600160a01b031614949350505050565b826001600160a01b031661108482610995565b6001600160a01b0316146110aa5760405162461bcd60e51b815260040161050f906129d7565b6001600160a01b03821661110c5760405162461bcd60e51b8152602060048201526024808201527f4552433732313a207472616e7366657220746f20746865207a65726f206164646044820152637265737360e01b606482015260840161050f565b826001600160a01b031661111f82610995565b6001600160a01b0316146111455760405162461bcd60e51b815260040161050f906129d7565b600081815260046020908152604080832080546001600160a01b03199081169091556001600160a01b0387811680865260038552838620805460001901905590871680865283862080546001019055868652600290945282852080549092168417909155905184937fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef91a4505050565b610aea82600080846117f2565b60006111ef610100611870565b9050611222604051806040016040528060068152602001651cdb1bdd125160d21b8152508261189190919063ffffffff16565b61122f8160ff85166118aa565b6040805180820190915260078152663b32b939b4b7b760c91b6020820152611258908290611891565b61126281836118aa565b6002602085015251516080909301929092525050565b805160000361129a5760405163fe936cb760e01b815260040160405180910390fd5b60a090910152565b606060006112b1610100611870565b90506112ea6040518060400160405280600c81526020016b31b7b232a637b1b0ba34b7b760a11b8152508261189190919063ffffffff16565b825161130890600281111561130157611301612a1c565b82906118b6565b6040805180820190915260088152676c616e677561676560c01b6020820152611332908290611891565b604083015161134990801561130157611301612a1c565b604080518082019091526006815265736f7572636560d01b6020820152611371908290611891565b6060830151611381908290611891565b60a08301515115611415576040805180820190915260048152636172677360e01b60208201526113b2908290611891565b6113bb816118ef565b60005b8360a001515181101561140b576113fb8460a0015182815181106113e4576113e46128e7565b60200260200101518361189190919063ffffffff16565b61140481612a48565b90506113be565b5061141581611913565b608083015151156114d95760008360200151600281111561143857611438612a1c565b036114565760405163a80d31f760e01b815260040160405180910390fd5b60408051808201909152600f81526e39b2b1b932ba39a637b1b0ba34b7b760891b6020820152611487908290611891565b6114a08360200151600281111561130157611301612a1c565b6040805180820190915260078152667365637265747360c81b60208201526114c9908290611891565b60808301516114d9908290611931565b60c083015151156115725760408051808201909152600981526862797465734172677360b81b602082015261150f908290611891565b611518816118ef565b60005b8360c0015151811015611568576115588460c001518281518110611541576115416128e7565b60200260200101518361193190919063ffffffff16565b61156181612a48565b905061151b565b5061157281611913565b515192915050565b6000807f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031663461d27628688600188886040518663ffffffff1660e01b81526004016115d2959493929190612a61565b6020604051808303816000875af11580156115f1573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906116159190612aaa565b60405190915081907f1131472297a800fee664d1d89cfa8f7676ff07189ecc53f80bbb5f4969099db890600090a295945050505050565b816001600160a01b0316836001600160a01b0316036116ad5760405162461bcd60e51b815260206004820152601960248201527f4552433732313a20617070726f766520746f2063616c6c657200000000000000604482015260640161050f565b6001600160a01b03838116600081815260056020908152604080832094871680845294825291829020805460ff191686151590811790915591519182527f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31910160405180910390a3505050565b611725848484611071565b6117318484848461193e565b610b205760405162461bcd60e51b815260040161050f90612ac3565b606061175882610cd3565b600061176f60408051602081019091526000815290565b9050600081511161178f57604051806020016040528060008152506117ba565b8061179984611a3c565b6040516020016117aa9291906128fd565b6040516020818303038152906040525b9392505050565b6117cd82600f54611ace565b6117d9600f5482611ae8565b600f80549060006117e983612a48565b91905055505050565b8051600003611814576040516322ce3edd60e01b815260040160405180910390fd5b8383600281111561182757611827612a1c565b9081600281111561183a5761183a612a1c565b9052506040840182801561185057611850612a1c565b9081801561186057611860612a1c565b9052506060909301929092525050565b6118786121e7565b80516118849083611bb3565b5060006020820152919050565b61189e8260038351611c2a565b81516105b09082611d43565b610aea82600083611c2a565b81516118c39060c2611d64565b50610aea82826040516020016118db91815260200190565b604051602081830303815290604052611931565b6118fa816004611dcd565b60018160200181815161190d9190612b15565b90525050565b61191e816007611dcd565b60018160200181815161190d9190612b28565b61189e8260028351611c2a565b60006001600160a01b0384163b15611a3457604051630a85bd0160e11b81526001600160a01b0385169063150b7a0290611982903390899088908890600401612b3b565b6020604051808303816000875af19250505080156119bd575060408051601f3d908101601f191682019092526119ba91810190612b78565b60015b611a1a573d8080156119eb576040519150601f19603f3d011682016040523d82523d6000602084013e6119f0565b606091505b508051600003611a125760405162461bcd60e51b815260040161050f90612ac3565b805181602001fd5b6001600160e01b031916630a85bd0160e11b149050610c2e565b506001610c2e565b60606000611a4983611de4565b60010190506000816001600160401b03811115611a6857611a68612311565b6040519080825280601f01601f191660200182016040528015611a92576020820181803683370190505b5090508181016020015b600019016f181899199a1a9b1b9c1cb0b131b232b360811b600a86061a8153600a8504945084611a9c57509392505050565b610aea828260405180602001604052806000815250611ebc565b6000828152600260205260409020546001600160a01b0316611b635760405162461bcd60e51b815260206004820152602e60248201527f45524337323155524953746f726167653a2055524920736574206f66206e6f6e60448201526d32bc34b9ba32b73a103a37b5b2b760911b606482015260840161050f565b6000828152600660205260409020611b7b8282612828565b506040518281527ff8e1a15aba9398e019f0b49df1a4fde98ee17ae345cb5f6b5e2c27f5033e8ce79060200160405180910390a15050565b604080518082019091526060815260006020820152611bd3602083612b95565b15611bfb57611be3602083612b95565b611bee906020612b28565b611bf89083612b15565b91505b602080840183905260405180855260008152908184010181811015611c1f57600080fd5b604052509192915050565b6017816001600160401b031611611c50578251610b209060e0600585901b168317611d64565b60ff816001600160401b031611611c90578251611c78906018611fe0600586901b1617611d64565b508251610b20906001600160401b0383166001611eef565b61ffff816001600160401b031611611cd1578251611cb9906019611fe0600586901b1617611d64565b508251610b20906001600160401b0383166002611eef565b63ffffffff816001600160401b031611611d14578251611cfc90601a611fe0600586901b1617611d64565b508251610b20906001600160401b0383166004611eef565b8251611d2b90601b611fe0600586901b1617611d64565b508251610b20906001600160401b0383166008611eef565b6040805180820190915260608152600060208201526117ba83838451611f74565b6040805180820190915260608152600060208201528251516000611d89826001612b15565b905084602001518210611daa57611daa85611da5836002612bb7565b612045565b8451602083820101858153508051821115611dc3578181525b5093949350505050565b81516105b090601f611fe0600585901b1617611d64565b60008072184f03e93ff9f4daa797ed6e38ed64bf6a1f0160401b8310611e235772184f03e93ff9f4daa797ed6e38ed64bf6a1f0160401b830492506040015b6d04ee2d6d415b85acef81000000008310611e4f576d04ee2d6d415b85acef8100000000830492506020015b662386f26fc100008310611e6d57662386f26fc10000830492506010015b6305f5e1008310611e85576305f5e100830492506008015b6127108310611e9957612710830492506004015b60648310611eab576064830492506002015b600a83106103dc5760010192915050565b611ec6838361205c565b611ed3600084848461193e565b6105b05760405162461bcd60e51b815260040161050f90612ac3565b6040805180820190915260608152600060208201528351516000611f138285612b15565b90508560200151811115611f3057611f3086611da5836002612bb7565b60006001611f4086610100612cb2565b611f4a9190612b28565b90508651828101878319825116178152508051831115611f68578281525b50959695505050505050565b6040805180820190915260608152600060208201528251821115611f9757600080fd5b8351516000611fa68483612b15565b90508560200151811115611fc357611fc386611da5836002612bb7565b855180518382016020019160009180851115611fdd578482525b505050602086015b6020861061201d5780518252611ffc602083612b15565b9150612009602082612b15565b9050612016602087612b28565b9550611fe5565b51815160001960208890036101000a0190811690199190911617905250849150509392505050565b81516120518383611bb3565b50610b208382611d43565b6001600160a01b0382166120b25760405162461bcd60e51b815260206004820181905260248201527f4552433732313a206d696e7420746f20746865207a65726f2061646472657373604482015260640161050f565b6000818152600260205260409020546001600160a01b0316156121175760405162461bcd60e51b815260206004820152601c60248201527f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000604482015260640161050f565b6000818152600260205260409020546001600160a01b03161561217c5760405162461bcd60e51b815260206004820152601c60248201527f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000604482015260640161050f565b6001600160a01b038216600081815260036020908152604080832080546001019055848352600290915280822080546001600160a01b0319168417905551839291907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef908290a45050565b604051806040016040528061220f604051806040016040528060608152602001600081525090565b8152602001600081525090565b6001600160e01b031981168114610d3257600080fd5b60006020828403121561224457600080fd5b81356117ba8161221c565b60005b8381101561226a578181015183820152602001612252565b50506000910152565b6000815180845261228b81602086016020860161224f565b601f01601f19169290920160200192915050565b6020815260006117ba6020830184612273565b6000602082840312156122c457600080fd5b5035919050565b80356001600160a01b03811681146122e257600080fd5b919050565b600080604083850312156122fa57600080fd5b612303836122cb565b946020939093013593505050565b634e487b7160e01b600052604160045260246000fd5b604051601f8201601f191681016001600160401b038111828210171561234f5761234f612311565b604052919050565b600082601f83011261236857600080fd5b81356001600160401b0381111561238157612381612311565b612394601f8201601f1916602001612327565b8181528460208386010111156123a957600080fd5b816020850160208301376000918101602001919091529392505050565b6000806000606084860312156123db57600080fd5b8335925060208401356001600160401b03808211156123f957600080fd5b61240587838801612357565b9350604086013591508082111561241b57600080fd5b5061242886828701612357565b9150509250925092565b60008060006060848603121561244757600080fd5b612450846122cb565b925061245e602085016122cb565b9150604084013590509250925092565b6000806040838503121561248157600080fd5b82356001600160401b038082111561249857600080fd5b6124a486838701612357565b935060208501359150808211156124ba57600080fd5b506124c785828601612357565b9150509250929050565b6000602082840312156124e357600080fd5b6117ba826122cb565b80356001600160401b03811681146122e257600080fd5b600080600080600060a0868803121561251b57600080fd5b853560ff8116811461252c57600080fd5b9450602061253b8782016124ec565b945060408701356001600160401b038082111561255757600080fd5b818901915089601f83011261256b57600080fd5b81358181111561257d5761257d612311565b8060051b61258c858201612327565b918252838101850191858101908d8411156125a657600080fd5b86860192505b838310156125e2578235858111156125c45760008081fd5b6125d28f89838a0101612357565b83525091860191908601906125ac565b809950505050505050506125f8606087016124ec565b9150612606608087016122cb565b90509295509295909350565b6000806040838503121561262557600080fd5b61262e836122cb565b91506020830135801515811461264357600080fd5b809150509250929050565b6000806000806080858703121561266457600080fd5b61266d856122cb565b935061267b602086016122cb565b92506040850135915060608501356001600160401b0381111561269d57600080fd5b6126a987828801612357565b91505092959194509250565b600080604083850312156126c857600080fd5b6126d1836122cb565b91506126df602084016122cb565b90509250929050565b600181811c908216806126fc57607f821691505b60208210810361271c57634e487b7160e01b600052602260045260246000fd5b50919050565b6020808252602d908201527f4552433732313a2063616c6c6572206973206e6f7420746f6b656e206f776e6560408201526c1c881bdc88185c1c1c9bdd9959609a1b606082015260800190565b6020808252602f908201527f796f7520646f206e6f742068617665207065726d697373696f6e20746f20636160408201526e3636103a343290333ab731ba34b7b760891b606082015260800190565b600082516127d081846020870161224f565b9190910192915050565b601f8211156105b057600081815260208120601f850160051c810160208610156128015750805b601f850160051c820191505b818110156128205782815560010161280d565b505050505050565b81516001600160401b0381111561284157612841612311565b6128558161284f84546126e8565b846127da565b602080601f83116001811461288a57600084156128725750858301515b600019600386901b1c1916600185901b178555612820565b600085815260208120601f198616915b828110156128b95788860151825594840194600190910190840161289a565b50858210156128d75787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b634e487b7160e01b600052603260045260246000fd5b6000835161290f81846020880161224f565b83519083019061292381836020880161224f565b01949350505050565b60008154612939816126e8565b80855260206001838116801561295657600181146129705761299e565b60ff1985168884015283151560051b88018301955061299e565b866000528260002060005b858110156129965781548a820186015290830190840161297b565b890184019650505b505050505092915050565b6040815260006129bc604083018561292c565b82810360208401526129ce818561292c565b95945050505050565b60208082526025908201527f4552433732313a207472616e736665722066726f6d20696e636f72726563742060408201526437bbb732b960d91b606082015260800190565b634e487b7160e01b600052602160045260246000fd5b634e487b7160e01b600052601160045260246000fd5b600060018201612a5a57612a5a612a32565b5060010190565b6001600160401b038616815260a060208201526000612a8360a0830187612273565b61ffff9590951660408301525063ffffffff92909216606083015260809091015292915050565b600060208284031215612abc57600080fd5b5051919050565b60208082526032908201527f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560408201527131b2b4bb32b91034b6b83632b6b2b73a32b960711b606082015260800190565b808201808211156103dc576103dc612a32565b818103818111156103dc576103dc612a32565b6001600160a01b0385811682528416602082015260408101839052608060608201819052600090612b6e90830184612273565b9695505050505050565b600060208284031215612b8a57600080fd5b81516117ba8161221c565b600082612bb257634e487b7160e01b600052601260045260246000fd5b500690565b80820281158282048414176103dc576103dc612a32565b600181815b80851115612c09578160001904821115612bef57612bef612a32565b80851615612bfc57918102915b93841c9390800290612bd3565b509250929050565b600082612c20575060016103dc565b81612c2d575060006103dc565b8160018114612c435760028114612c4d57612c69565b60019150506103dc565b60ff841115612c5e57612c5e612a32565b50506001821b6103dc565b5060208310610133831016604e8410600b8410161715612c8c575081810a6103dc565b612c968383612bce565b8060001904821115612caa57612caa612a32565b029392505050565b60006117ba8383612c1156fe636f6e73742067696674436f6465203d20617267735b305d3b69662821736563726574732e6170696b657929207b207468726f77204572726f7228224572726f723a20537570616261736520415049204b6579206973206e6f7420736574212229207d3b636f6e7374206170696b6579203d20736563726574732e6170696b65793b636f6e737420617069526573706f6e7365203d2061776169742046756e6374696f6e732e6d616b654874747052657175657374287b75726c3a202268747470733a2f2f686574697164687a7568676565646571646d6d622e73757061626173652e636f2f726573742f76312f47696674733f73656c6563743d676966745f6e616d652c676966745f636f6465222c6d6574686f643a2022474554222c686561646572733a207b20226170696b6579223a206170696b65792c7d7d293b69662028617069526573706f6e73652e6572726f7229207b636f6e736f6c652e6572726f7228617069526573706f6e73652e6572726f72293b7468726f77204572726f72282252657175657374206661696c656422293b7d3b636f6e7374207b2064617461207d203d20617069526573706f6e73653b636f6e7374206974656d203d20646174612e66696e64286974656d203d3e206974656d2e676966745f636f6465203d3d2067696674436f6465293b6966286974656d203d3d20756e646566696e656429207b72657475726e2046756e6374696f6e732e656e636f6465537472696e6728226e6f7420666f756e6422297d3b72657475726e2046756e6374696f6e732e656e636f6465537472696e67286974656d2e676966745f6e616d65293ba2646970667358221220a79969e9efcac0035ee3a94c20ce1d587b8f9ad00b1677cdce56cb6174c6cb2764736f6c63430008130033697066733a2f2f516d664e68687055657a514c6379715842474c34656850776f37476662776b3979793359634a7147677239645062697066733a2f2f516d614771424e7148617a436a534d4e4d75446b365672676a4e4c4d514b4e5a716161623176664d4841776b6f6a697066733a2f2f516d4e787137477165685a663953704345464b3743346d6f785a545a504e77436572357943417143424e646b3261"
    }
  },
  version: "0.8.19+commit.7dd6d404.Darwin.appleclang"
};

// src/custom-plugins/actions/getGift.ts
var GetGiftAction = class {
  /**
   * Creates an instance of GetGiftAction.
   * @param {WalletProvider} walletProvider - The wallet provider instance.
   */
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  /**
   * Sends a gift request to the smart contract.
   * @param {GetGiftParams} params - The parameters for the gift request.
   * @returns {Promise<Transaction>} The transaction details.
   * @throws Will throw an error if contract address, slot ID, version, or subscription ID is not set.
   */
  async getGift(params) {
    const chainName = "avalancheFuji";
    const contractAddress = "0xf998134a7810d4E543425c90353bB1c2D0CA3664";
    const donHostedSecretsSlotID = 0;
    const donHostedSecretsVersion = 1754478082;
    const clSubId = 15723;
    if (contractAddress === "0x00" || donHostedSecretsSlotID === Infinity || donHostedSecretsVersion === Infinity || clSubId === Infinity) {
      throw new Error("Contract address, slot ID, version, or subscription ID is not set");
    }
    console.log(
      `Get gift with Id: ${params.code} and address (${params.address})`
    );
    this.walletProvider.switchChain(chainName);
    const walletClient = this.walletProvider.getWalletClient(
      chainName
    );
    try {
      const { abi } = GetGift_default["contracts"]["GetGift.sol:GetGift"];
      const getGiftContract = getContract({
        address: contractAddress,
        abi,
        client: walletClient
      });
      const args = [params.code];
      const userAddr = params.address;
      const hash = await getGiftContract.write.sendRequest([
        donHostedSecretsSlotID,
        donHostedSecretsVersion,
        args,
        clSubId,
        userAddr
      ]);
      return {
        hash,
        from: walletClient.account.address,
        to: contractAddress,
        value: parseEther("0"),
        data: "0x"
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Function call failed: ${error.message}`);
      } else {
        throw new Error(`Function call failed: unknown error`);
      }
    }
  }
};
var buildFunctionCallDetails = async (state, runtime, wp) => {
  const chains = Object.keys(wp.chains);
  state.supportedChains = chains.map((item) => `"${item}"`).join("|");
  const context = composeContext({
    state,
    template: getGiftTemplate
  });
  const functionCallDetails = await generateObjectDeprecated({
    runtime,
    context,
    modelClass: ModelClass.SMALL
  });
  return functionCallDetails;
};
var getGiftAction = {
  name: "get gift",
  description: "Given a wallet address and gift code, extract that data and call a function on the Functions Consumer Smart Contract and send request",
  handler: async (runtime, message, state, _options, callback) => {
    if (!state) {
      state = await runtime.composeState(message);
    } else {
      state = await runtime.updateRecentMessageState(state);
    }
    console.log("Get gift action handler called");
    const walletProvider = await initWalletProvider(runtime);
    const action = new GetGiftAction(walletProvider);
    const giftParams = await buildFunctionCallDetails(
      state,
      runtime,
      walletProvider
    );
    try {
      const callFunctionResp = await action.getGift(giftParams);
      if (callback) {
        callback({
          text: `Successfully called function with params of gift code: ${giftParams.code} and address: ${giftParams.address}
Transaction Hash: ${callFunctionResp.hash}`,
          content: {
            success: true,
            hash: callFunctionResp.hash,
            amount: formatEther(callFunctionResp.value),
            recipient: callFunctionResp.to,
            chain: "avalanchefuji"
          }
        });
      }
      return true;
    } catch (error) {
      console.error("Error during get gift call:", error);
      if (error instanceof Error) {
        if (callback) {
          callback({
            text: `Error get gift calling: ${error.message}`,
            content: { error: error.message }
          });
        }
      } else {
        console.error("unknow error");
      }
      return false;
    }
  },
  validate: async (runtime) => {
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
    return typeof privateKey === "string" && privateKey.startsWith("0x");
  },
  examples: [
    [
      {
        user: "assistant",
        content: {
          text: "I'll help you call function on contract",
          action: "GET_GIFT"
        }
      },
      {
        user: "user",
        content: {
          text: "Give me the gift to address 0x1234567890123456789012345678901234567890, ID for gift is 1010",
          action: "GET_GIFT"
        }
      },
      {
        user: "user",
        content: {
          text: "Can I get the gift to address 0x1234567890123456789012345678901234567890, my gift ID is 898770",
          action: "GET_GIFT"
        }
      }
    ]
  ],
  similes: ["GET_GIFT", "GIFT_GIVE", "SEND_GIFT"]
};

// src/custom-plugins/index.ts
var getGiftPlugin = {
  name: "getGift",
  description: "EVM blockchain integration plugin",
  providers: [evmWalletProvider],
  evaluators: [],
  services: [],
  actions: [getGiftAction]
};
var custom_plugins_default = getGiftPlugin;

// src/index.ts
import { evmPlugin } from "@elizaos/plugin-evm";
import fs3 from "fs";
import net from "net";
import path5 from "path";
import { fileURLToPath } from "url";

// src/cache/index.ts
import { CacheManager, DbCacheAdapter } from "@elizaos/core";
function initializeDbCache(character2, db) {
  if (!character2.id) throw new Error("There is no id in character");
  const cache = new CacheManager(new DbCacheAdapter(db, character2.id));
  return cache;
}

// src/character.ts
import { Clients, defaultCharacter, ModelProviderName } from "@elizaos/core";
var character = {
  ...defaultCharacter,
  // name: "Eliza",
  plugins: [custom_plugins_default],
  clients: [Clients.TWITTER],
  modelProvider: ModelProviderName.GOOGLE,
  settings: {
    secrets: {},
    voice: {
      model: "en_US-hfc_female-medium"
    },
    chains: {
      "evm": ["avalancheFuji"]
    }
  }
};

// src/chat/index.ts
import { settings } from "@elizaos/core";
import readline from "readline";
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.on("SIGINT", () => {
  rl.close();
  process.exit(0);
});
async function handleUserInput(input, agentId) {
  if (input.toLowerCase() === "exit") {
    rl.close();
    process.exit(0);
  }
  try {
    const serverPort = parseInt(settings.SERVER_PORT || "3000");
    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User"
        })
      }
    );
    const data = await response.json();
    data.forEach((message) => console.log(`${"Agent"}: ${message.text}`));
  } catch (error) {
    console.error("Error fetching response:", error);
  }
}
function startChat(characters) {
  function chat() {
    const agentId = characters[0].name ?? "Agent";
    rl.question("You: ", async (input) => {
      await handleUserInput(input, agentId);
      if (input.toLowerCase() !== "exit") {
        chat();
      }
    });
  }
  return chat;
}

// src/clients/index.ts
import { AutoClientInterface } from "@elizaos/client-auto";

// src/light_twitter-clients/index.ts
import {
  elizaLogger as elizaLogger6
} from "@elizaos/core";

// src/light_twitter-clients/base.ts
import {
  getEmbeddingZeroVector,
  elizaLogger as elizaLogger2,
  stringToUuid
} from "@elizaos/core";
import {
  Scraper,
  SearchMode
} from "agent-twitter-client";
import { EventEmitter } from "events";
var RequestQueue = class {
  queue = [];
  processing = false;
  async add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      try {
        await request();
      } catch (error) {
        console.error("Error processing request:", error);
        this.queue.unshift(request);
        await this.exponentialBackoff(this.queue.length);
      }
      await this.randomDelay();
    }
    this.processing = false;
  }
  async exponentialBackoff(retryCount) {
    const delay = Math.pow(2, retryCount) * 1e3;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  async randomDelay() {
    const delay = Math.floor(Math.random() * 2e3) + 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
};
var ClientBase = class _ClientBase extends EventEmitter {
  static _twitterClients = {};
  twitterClient;
  runtime;
  twitterConfig;
  directions;
  lastCheckedTweetId = null;
  imageDescriptionService;
  temperature = 0.5;
  requestQueue = new RequestQueue();
  profile;
  async cacheTweet(tweet) {
    if (!tweet) {
      console.warn("Tweet is undefined, skipping cache");
      return;
    }
    this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
  }
  async getCachedTweet(tweetId) {
    const cached = await this.runtime.cacheManager.get(
      `twitter/tweets/${tweetId}`
    );
    return cached;
  }
  async getTweet(tweetId) {
    const cachedTweet = await this.getCachedTweet(tweetId);
    if (cachedTweet) {
      return cachedTweet;
    }
    const tweet = await this.requestQueue.add(
      () => this.twitterClient.getTweet(tweetId)
    );
    if (!tweet) {
      throw new Error("Tweet is undefined");
    }
    await this.cacheTweet(tweet);
    return tweet;
  }
  callback = (self) => {
  };
  onReady() {
    throw new Error(
      "Not implemented in base class, please call from subclass"
    );
  }
  constructor(runtime, twitterConfig) {
    super();
    this.runtime = runtime;
    this.twitterConfig = twitterConfig;
    const username = twitterConfig.TWITTER_USERNAME;
    if (_ClientBase._twitterClients[username]) {
      this.twitterClient = _ClientBase._twitterClients[username];
    } else {
      this.twitterClient = new Scraper();
      _ClientBase._twitterClients[username] = this.twitterClient;
    }
    this.directions = "- " + this.runtime.character.style.all.join("\n- ") + "- " + this.runtime.character.style.post.join();
  }
  async init() {
    const username = this.twitterConfig.TWITTER_USERNAME;
    const password = this.twitterConfig.TWITTER_PASSWORD;
    const email = this.twitterConfig.TWITTER_EMAIL;
    let retries = this.twitterConfig.TWITTER_RETRY_LIMIT;
    const twitter2faSecret = this.twitterConfig.TWITTER_2FA_SECRET;
    if (!username) {
      throw new Error("Twitter username not configured");
    }
    const cachedCookies = await this.getCachedCookies(username);
    if (cachedCookies) {
      elizaLogger2.info("Using cached cookies");
      await this.setCookiesFromArray(cachedCookies);
    }
    elizaLogger2.log("Waiting for Twitter login");
    while (retries > 0) {
      try {
        if (await this.twitterClient.isLoggedIn()) {
          elizaLogger2.info("Successfully logged in.");
          break;
        } else {
          await this.twitterClient.login(
            username,
            password,
            email,
            twitter2faSecret
          );
          if (await this.twitterClient.isLoggedIn()) {
            elizaLogger2.info("Successfully logged in.");
            elizaLogger2.info("Caching cookies");
            await this.cacheCookies(
              username,
              await this.twitterClient.getCookies()
            );
            break;
          }
        }
      } catch (error) {
        error instanceof Error ? elizaLogger2.error(`Login attempt failed: ${error.message}`) : elizaLogger2.error(`Login attempt failed: ${String(error)}`);
      }
      retries--;
      elizaLogger2.error(
        `Failed to login to Twitter. Retrying... (${retries} attempts left)`
      );
      if (retries === 0) {
        elizaLogger2.error(
          "Max retries reached. Exiting login process."
        );
        throw new Error("Twitter login failed after maximum retries.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
    this.profile = await this.fetchProfile(username);
    if (this.profile) {
      elizaLogger2.log("Twitter user ID:", this.profile.id);
      elizaLogger2.log(
        "Twitter loaded:",
        JSON.stringify(this.profile, null, 10)
      );
      this.runtime.character.twitterProfile = {
        id: this.profile.id,
        username: this.profile.username,
        screenName: this.profile.screenName,
        bio: this.profile.bio,
        nicknames: this.profile.nicknames
      };
    } else {
      throw new Error("Failed to load profile");
    }
    await this.loadLatestCheckedTweetId();
    await this.populateTimeline();
  }
  async fetchOwnPosts(count) {
    elizaLogger2.debug("fetching own posts");
    if (!this.profile) {
      throw new Error("Profile not loaded");
    }
    const homeTimeline = await this.twitterClient.getUserTweets(
      this.profile.id,
      count
    );
    return homeTimeline.tweets;
  }
  /**
   * Fetch timeline for twitter account, optionally only from followed accounts
   */
  async fetchHomeTimeline(count, following) {
    elizaLogger2.debug("fetching home timeline");
    const homeTimeline = following ? await this.twitterClient.fetchFollowingTimeline(count, []) : await this.twitterClient.fetchHomeTimeline(count, []);
    elizaLogger2.debug(homeTimeline, { depth: Infinity });
    const processedTimeline = homeTimeline.filter((t) => t.__typename !== "TweetWithVisibilityResults").map((tweet) => {
      const obj = {
        id: tweet.id,
        name: tweet.name ?? tweet?.user_results?.result?.legacy.name,
        username: tweet.username ?? tweet.core?.user_results?.result?.legacy.screen_name,
        text: tweet.text ?? tweet.legacy?.full_text,
        inReplyToStatusId: tweet.inReplyToStatusId ?? tweet.legacy?.in_reply_to_status_id_str ?? null,
        timestamp: new Date(tweet.legacy?.created_at).getTime() / 1e3,
        createdAt: tweet.createdAt ?? tweet.legacy?.created_at ?? tweet.core?.user_results?.result?.legacy.created_at,
        userId: tweet.userId ?? tweet.legacy?.user_id_str,
        conversationId: tweet.conversationId ?? tweet.legacy?.conversation_id_str,
        permanentUrl: `https://x.com/${tweet.core?.user_results?.result?.legacy?.screen_name}/status/${tweet.rest_id}`,
        hashtags: tweet.hashtags ?? tweet.legacy?.entities.hashtags,
        mentions: tweet.mentions ?? tweet.legacy?.entities.user_mentions,
        photos: tweet.legacy?.entities?.media?.filter(
          (media) => media.type === "photo"
        ).map((media) => ({
          id: media.id_str,
          url: media.media_url_https,
          // Store media_url_https as url
          alt_text: media.alt_text
        })) || [],
        thread: tweet.thread || [],
        urls: tweet.urls ?? tweet.legacy?.entities.urls,
        videos: tweet.videos ?? tweet.legacy?.entities.media?.filter(
          (media) => media.type === "video"
        ) ?? []
      };
      return obj;
    });
    return processedTimeline;
  }
  async fetchTimelineForActions(count) {
    elizaLogger2.debug("fetching timeline for actions");
    const agentUsername = this.twitterConfig.TWITTER_USERNAME;
    const homeTimeline = await this.twitterClient.fetchHomeTimeline(
      count,
      []
    );
    return homeTimeline.map((tweet) => ({
      id: tweet.rest_id,
      name: tweet.core?.user_results?.result?.legacy?.name,
      username: tweet.core?.user_results?.result?.legacy?.screen_name,
      text: tweet.legacy?.full_text,
      inReplyToStatusId: tweet.legacy?.in_reply_to_status_id_str,
      timestamp: new Date(tweet.legacy?.created_at).getTime() / 1e3,
      userId: tweet.legacy?.user_id_str,
      conversationId: tweet.legacy?.conversation_id_str,
      permanentUrl: `https://twitter.com/${tweet.core?.user_results?.result?.legacy?.screen_name}/status/${tweet.rest_id}`,
      hashtags: tweet.legacy?.entities?.hashtags || [],
      mentions: tweet.legacy?.entities?.user_mentions || [],
      photos: tweet.legacy?.entities?.media?.filter(
        (media) => media.type === "photo"
      ).map((media) => ({
        id: media.id_str,
        url: media.media_url_https,
        // Store media_url_https as url
        alt_text: media.alt_text
      })) || [],
      thread: tweet.thread || [],
      urls: tweet.legacy?.entities?.urls || [],
      videos: tweet.legacy?.entities?.media?.filter(
        (media) => media.type === "video"
      ) || []
    })).filter((tweet) => tweet.username !== agentUsername);
  }
  async fetchSearchTweets(query, maxTweets, searchMode, cursor) {
    try {
      const timeoutPromise = new Promise(
        (resolve) => setTimeout(() => resolve({ tweets: [] }), 15e3)
      );
      try {
        const result = await this.requestQueue.add(
          async () => await Promise.race([
            this.twitterClient.fetchSearchTweets(
              query,
              maxTweets,
              searchMode,
              cursor
            ),
            timeoutPromise
          ])
        );
        return result ?? { tweets: [] };
      } catch (error) {
        elizaLogger2.error("Error fetching search tweets:", error);
        return { tweets: [] };
      }
    } catch (error) {
      elizaLogger2.error("Error fetching search tweets:", error);
      return { tweets: [] };
    }
  }
  async populateTimeline() {
    elizaLogger2.debug("populating timeline...");
    const cachedTimeline = await this.getCachedTimeline();
    if (cachedTimeline) {
      const existingMemories2 = await this.runtime.messageManager.getMemoriesByRoomIds({
        roomIds: cachedTimeline.map(
          (tweet) => stringToUuid(
            tweet.conversationId + "-" + this.runtime.agentId
          )
        )
      });
      const existingMemoryIds2 = new Set(
        existingMemories2.map((memory) => {
          if (!memory.id) {
            throw new Error("Memory is undefined");
          }
          return memory.id.toString();
        })
      );
      const someCachedTweetsExist = cachedTimeline.some(
        (tweet) => existingMemoryIds2.has(
          stringToUuid(tweet.id + "-" + this.runtime.agentId)
        )
      );
      if (someCachedTweetsExist) {
        const tweetsToSave2 = cachedTimeline.filter(
          (tweet) => !existingMemoryIds2.has(
            stringToUuid(tweet.id + "-" + this.runtime.agentId)
          )
        );
        console.log({
          processingTweets: tweetsToSave2.map((tweet) => tweet.id).join(",")
        });
        for (const tweet of tweetsToSave2) {
          elizaLogger2.log("Saving Tweet", tweet.id);
          const roomId = stringToUuid(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const userId = tweet.userId === this.profile?.id ? this.runtime.agentId : stringToUuid(tweet.userId ?? "");
          if (tweet.userId === this.profile?.id) {
            await this.runtime.ensureConnection(
              this.runtime.agentId,
              roomId,
              this.profile?.username,
              this.profile?.screenName,
              "twitter"
            );
          } else {
            await this.runtime.ensureConnection(
              userId,
              roomId,
              tweet.username,
              tweet.name,
              "twitter"
            );
          }
          const content = {
            text: tweet.text,
            url: tweet.permanentUrl,
            source: "twitter",
            inReplyTo: tweet.inReplyToStatusId ? stringToUuid(
              tweet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          };
          elizaLogger2.log("Creating memory for tweet", tweet.id);
          const memory = await this.runtime.messageManager.getMemoryById(
            stringToUuid(tweet.id + "-" + this.runtime.agentId)
          );
          if (memory) {
            elizaLogger2.log(
              "Memory already exists, skipping timeline population"
            );
            break;
          }
          if (!tweet.timestamp) {
            throw new Error("Tweet timestamp is undefined");
          }
          await this.runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
            userId,
            content,
            agentId: this.runtime.agentId,
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp * 1e3
          });
          await this.cacheTweet(tweet);
        }
        elizaLogger2.log(
          `Populated ${tweetsToSave2.length} missing tweets from the cache.`
        );
        return;
      }
    }
    const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);
    const username = this.twitterConfig.TWITTER_USERNAME;
    const mentionsAndInteractions = await this.fetchSearchTweets(
      `@${username}`,
      20,
      SearchMode.Latest
    );
    const allTweets = [...timeline, ...mentionsAndInteractions.tweets];
    const tweetIdsToCheck = /* @__PURE__ */ new Set();
    const roomIds = /* @__PURE__ */ new Set();
    for (const tweet of allTweets) {
      tweetIdsToCheck.add(tweet.id ?? "");
      roomIds.add(
        stringToUuid(tweet.conversationId + "-" + this.runtime.agentId)
      );
    }
    const existingMemories = await this.runtime.messageManager.getMemoriesByRoomIds({
      roomIds: Array.from(roomIds)
    });
    const existingMemoryIds = new Set(
      existingMemories.map((memory) => memory.id)
    );
    const tweetsToSave = allTweets.filter(
      (tweet) => !existingMemoryIds.has(
        stringToUuid(tweet.id + "-" + this.runtime.agentId)
      )
    );
    elizaLogger2.debug({
      processingTweets: tweetsToSave.map((tweet) => tweet.id).join(",")
    });
    if (!this.profile) {
      throw new Error("Profile is undefined");
    }
    await this.runtime.ensureUserExists(
      this.runtime.agentId,
      this.profile.username,
      this.runtime.character.name,
      "twitter"
    );
    for (const tweet of tweetsToSave) {
      elizaLogger2.log("Saving Tweet", tweet.id);
      const roomId = stringToUuid(
        tweet.conversationId + "-" + this.runtime.agentId
      );
      const userId = tweet.userId === this.profile?.id ? this.runtime.agentId : stringToUuid(tweet.userId ?? "");
      if (tweet.userId === this.profile?.id) {
        await this.runtime.ensureConnection(
          this.runtime.agentId,
          roomId,
          this.profile?.username,
          this.profile?.screenName,
          "twitter"
        );
      } else {
        await this.runtime.ensureConnection(
          userId,
          roomId,
          tweet.username,
          tweet.name,
          "twitter"
        );
      }
      const content = {
        text: tweet.text,
        url: tweet.permanentUrl,
        source: "twitter",
        inReplyTo: tweet.inReplyToStatusId ? stringToUuid(tweet.inReplyToStatusId) : void 0
      };
      if (tweet.timestamp === void 0) {
        throw new Error("Tweet timestamp is undefined");
      }
      await this.runtime.messageManager.createMemory({
        id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
        userId,
        content,
        agentId: this.runtime.agentId,
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1e3
      });
      await this.cacheTweet(tweet);
    }
    await this.cacheTimeline(timeline);
    await this.cacheMentions(mentionsAndInteractions.tweets);
  }
  async setCookiesFromArray(cookiesArray) {
    const cookieStrings = cookiesArray.map(
      (cookie) => `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${cookie.secure ? "Secure" : ""}; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${cookie.sameSite || "Lax"}`
    );
    await this.twitterClient.setCookies(cookieStrings);
  }
  async saveRequestMessage(message, state) {
    if (message.content.text) {
      const recentMessage = await this.runtime.messageManager.getMemories(
        {
          roomId: message.roomId,
          count: 1,
          unique: false
        }
      );
      if (recentMessage.length > 0 && recentMessage[0].content === message.content) {
        elizaLogger2.debug("Message already saved", recentMessage[0].id);
      } else {
        await this.runtime.messageManager.createMemory({
          ...message,
          embedding: getEmbeddingZeroVector()
        });
      }
      await this.runtime.evaluate(message, {
        ...state,
        twitterClient: this.twitterClient
      });
    }
  }
  async loadLatestCheckedTweetId() {
    const latestCheckedTweetId = await this.runtime.cacheManager.get(
      `twitter/${this.profile?.username}/latest_checked_tweet_id`
    );
    if (latestCheckedTweetId) {
      this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
    }
  }
  async cacheLatestCheckedTweetId() {
    if (this.lastCheckedTweetId) {
      await this.runtime.cacheManager.set(
        `twitter/${this.profile?.username}/latest_checked_tweet_id`,
        this.lastCheckedTweetId.toString()
      );
    }
  }
  async getCachedTimeline() {
    return await this.runtime.cacheManager.get(
      `twitter/${this.profile?.username}/timeline`
    );
  }
  async cacheTimeline(timeline) {
    await this.runtime.cacheManager.set(
      `twitter/${this.profile?.username}/timeline`,
      timeline,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async cacheMentions(mentions) {
    await this.runtime.cacheManager.set(
      `twitter/${this.profile?.username}/mentions`,
      mentions,
      { expires: Date.now() + 10 * 1e3 }
    );
  }
  async getCachedCookies(username) {
    return await this.runtime.cacheManager.get(
      `twitter/${username}/cookies`
    );
  }
  async cacheCookies(username, cookies) {
    await this.runtime.cacheManager.set(
      `twitter/${username}/cookies`,
      cookies
    );
  }
  async getCachedProfile(username) {
    return await this.runtime.cacheManager.get(
      `twitter/${username}/profile`
    );
  }
  async cacheProfile(profile) {
    await this.runtime.cacheManager.set(
      `twitter/${profile.username}/profile`,
      profile
    );
  }
  async fetchProfile(username) {
    const cached = await this.getCachedProfile(username);
    if (cached) return cached;
    try {
      const profile = await this.requestQueue.add(async () => {
        const profile2 = await this.twitterClient.getProfile(username);
        return {
          id: profile2.userId ?? "",
          username,
          screenName: profile2.name || this.runtime.character.name,
          bio: profile2.biography || typeof this.runtime.character.bio === "string" ? this.runtime.character.bio : this.runtime.character.bio.length > 0 ? this.runtime.character.bio[0] : "",
          nicknames: this.runtime.character.twitterProfile?.nicknames || []
        };
      });
      this.cacheProfile(profile);
      return profile;
    } catch (error) {
      console.error("Error fetching Twitter profile:", error);
      throw new Error("Failed to fetch Twitter profile");
    }
  }
};

// src/light_twitter-clients/environment.ts
import { parseBooleanFromText } from "@elizaos/core";
import { z, ZodError } from "zod";
var DEFAULT_MAX_TWEET_LENGTH = 280;
var twitterUsernameSchema = z.string().min(1, "An X/Twitter Username must be at least 1 characters long").max(15, "An X/Twitter Username cannot exceed 15 characters").regex(
  /^[A-Za-z0-9_]*$/,
  "An X Username can only contain letters, numbers, and underscores"
);
var twitterEnvSchema = z.object({
  TWITTER_DRY_RUN: z.boolean(),
  TWITTER_USERNAME: z.string().min(1, "X/Twitter username is required"),
  TWITTER_PASSWORD: z.string().min(1, "X/Twitter password is required"),
  TWITTER_EMAIL: z.string().email("Valid X/Twitter email is required"),
  MAX_TWEET_LENGTH: z.number().int().default(DEFAULT_MAX_TWEET_LENGTH),
  TWITTER_SEARCH_ENABLE: z.boolean().default(false),
  TWITTER_2FA_SECRET: z.string(),
  TWITTER_RETRY_LIMIT: z.number().int(),
  TWITTER_POLL_INTERVAL: z.number().int(),
  TWITTER_TARGET_USERS: z.array(twitterUsernameSchema).default([]),
  // I guess it's possible to do the transformation with zod
  // not sure it's preferable, maybe a readability issue
  // since more people will know js/ts than zod
  /*
      z
      .string()
      .transform((val) => val.trim())
      .pipe(
          z.string()
              .transform((val) =>
                  val ? val.split(',').map((u) => u.trim()).filter(Boolean) : []
              )
              .pipe(
                  z.array(
                      z.string()
                          .min(1)
                          .max(15)
                          .regex(
                              /^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$|^[A-Za-z]$/,
                              'Invalid Twitter username format'
                          )
                  )
              )
              .transform((users) => users.join(','))
      )
      .optional()
      .default(''),
  */
  POST_INTERVAL_MIN: z.number().int(),
  POST_INTERVAL_MAX: z.number().int(),
  ENABLE_ACTION_PROCESSING: z.boolean(),
  ACTION_INTERVAL: z.number().int(),
  POST_IMMEDIATELY: z.boolean(),
  TWITTER_SPACES_ENABLE: z.boolean().default(false)
});
function parseTargetUsers(targetUsersStr) {
  if (!targetUsersStr?.trim()) {
    return [];
  }
  return targetUsersStr.split(",").map((user) => user.trim()).filter(Boolean);
}
function safeParseInt(value, defaultValue) {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : Math.max(1, parsed);
}
async function validateTwitterConfig(runtime) {
  try {
    const twitterConfig = {
      TWITTER_DRY_RUN: parseBooleanFromText(
        runtime.getSetting("TWITTER_DRY_RUN") || process.env.TWITTER_DRY_RUN || ""
      ) ?? false,
      // parseBooleanFromText return null if "", map "" to false
      TWITTER_USERNAME: runtime.getSetting("TWITTER_USERNAME") || process.env.TWITTER_USERNAME,
      TWITTER_PASSWORD: runtime.getSetting("TWITTER_PASSWORD") || process.env.TWITTER_PASSWORD,
      TWITTER_EMAIL: runtime.getSetting("TWITTER_EMAIL") || process.env.TWITTER_EMAIL,
      // number as string?
      MAX_TWEET_LENGTH: safeParseInt(
        runtime.getSetting("MAX_TWEET_LENGTH") || process.env.MAX_TWEET_LENGTH,
        DEFAULT_MAX_TWEET_LENGTH
      ),
      TWITTER_SEARCH_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SEARCH_ENABLE") || process.env.TWITTER_SEARCH_ENABLE || ""
      ) ?? false,
      // string passthru
      TWITTER_2FA_SECRET: runtime.getSetting("TWITTER_2FA_SECRET") || process.env.TWITTER_2FA_SECRET || "",
      // int
      TWITTER_RETRY_LIMIT: safeParseInt(
        runtime.getSetting("TWITTER_RETRY_LIMIT") || process.env.TWITTER_RETRY_LIMIT,
        5
      ),
      // int in seconds
      TWITTER_POLL_INTERVAL: safeParseInt(
        runtime.getSetting("TWITTER_POLL_INTERVAL") || process.env.TWITTER_POLL_INTERVAL,
        120
        // 2m
      ),
      // comma separated string
      TWITTER_TARGET_USERS: parseTargetUsers(
        runtime.getSetting("TWITTER_TARGET_USERS") || process.env.TWITTER_TARGET_USERS
      ),
      // int in minutes
      POST_INTERVAL_MIN: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MIN") || process.env.POST_INTERVAL_MIN,
        90
        // 1.5 hours
      ),
      // int in minutes
      POST_INTERVAL_MAX: safeParseInt(
        runtime.getSetting("POST_INTERVAL_MAX") || process.env.POST_INTERVAL_MAX,
        180
        // 3 hours
      ),
      // bool
      ENABLE_ACTION_PROCESSING: parseBooleanFromText(
        runtime.getSetting("ENABLE_ACTION_PROCESSING") || process.env.ENABLE_ACTION_PROCESSING || ""
      ) ?? false,
      // init in minutes (min 1m)
      ACTION_INTERVAL: safeParseInt(
        runtime.getSetting("ACTION_INTERVAL") || process.env.ACTION_INTERVAL,
        5
        // 5 minutes
      ),
      // bool
      POST_IMMEDIATELY: parseBooleanFromText(
        runtime.getSetting("POST_IMMEDIATELY") || process.env.POST_IMMEDIATELY || ""
      ) ?? false,
      TWITTER_SPACES_ENABLE: parseBooleanFromText(
        runtime.getSetting("TWITTER_SPACES_ENABLE") || process.env.TWITTER_SPACES_ENABLE || ""
      ) ?? false
    };
    return twitterEnvSchema.parse(twitterConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `X/Twitter configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/light_twitter-clients/interactions.ts
import { SearchMode as SearchMode2 } from "agent-twitter-client";
import {
  composeContext as composeContext2,
  generateMessageResponse,
  messageCompletionFooter,
  ModelClass as ModelClass2,
  stringToUuid as stringToUuid3,
  elizaLogger as elizaLogger4,
  getEmbeddingZeroVector as getEmbeddingZeroVector3
} from "@elizaos/core";

// src/light_twitter-clients/utils.ts
import { getEmbeddingZeroVector as getEmbeddingZeroVector2 } from "@elizaos/core";
import { stringToUuid as stringToUuid2 } from "@elizaos/core";
import { elizaLogger as elizaLogger3 } from "@elizaos/core";
import fs from "fs";
import path2 from "path";
var wait = (minTime = 1e3, maxTime = 3e3) => {
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};
async function buildConversationThread(tweet, client, maxReplies = 10) {
  const thread = [];
  const visited = /* @__PURE__ */ new Set();
  async function processThread(currentTweet, depth = 0) {
    elizaLogger3.debug("Processing tweet:", {
      id: currentTweet.id,
      inReplyToStatusId: currentTweet.inReplyToStatusId,
      depth
    });
    if (!currentTweet) {
      elizaLogger3.debug("No current tweet found for thread building");
      return;
    }
    if (depth >= maxReplies) {
      elizaLogger3.debug("Reached maximum reply depth", depth);
      return;
    }
    const memory = await client.runtime.messageManager.getMemoryById(
      stringToUuid2(currentTweet.id + "-" + client.runtime.agentId)
    );
    if (!memory) {
      const roomId = stringToUuid2(
        currentTweet.conversationId + "-" + client.runtime.agentId
      );
      const userId = stringToUuid2(currentTweet.userId ?? "");
      await client.runtime.ensureConnection(
        userId,
        roomId,
        currentTweet.username,
        currentTweet.name,
        "twitter"
      );
      if (!currentTweet.text || !currentTweet.timestamp) {
        throw new Error("Tweet is missing text or timestamp");
      }
      await client.runtime.messageManager.createMemory({
        id: stringToUuid2(
          currentTweet.id + "-" + client.runtime.agentId
        ),
        agentId: client.runtime.agentId,
        content: {
          text: currentTweet.text,
          source: "twitter",
          url: currentTweet.permanentUrl,
          inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid2(
            currentTweet.inReplyToStatusId + "-" + client.runtime.agentId
          ) : void 0
        },
        createdAt: currentTweet.timestamp * 1e3,
        roomId,
        userId: currentTweet.userId === client.profile?.id ? client.runtime.agentId : stringToUuid2(currentTweet.userId ?? ""),
        embedding: getEmbeddingZeroVector2()
      });
    }
    if (!currentTweet.id) {
      throw new Error("Tweet is missing id");
    }
    if (visited.has(currentTweet.id)) {
      elizaLogger3.debug("Already visited tweet:", currentTweet.id);
      return;
    }
    visited.add(currentTweet.id);
    thread.unshift(currentTweet);
    elizaLogger3.debug("Current thread state:", {
      length: thread.length,
      currentDepth: depth,
      tweetId: currentTweet.id
    });
    if (currentTweet.inReplyToStatusId) {
      elizaLogger3.debug(
        "Fetching parent tweet:",
        currentTweet.inReplyToStatusId
      );
      try {
        const parentTweet = await client.twitterClient.getTweet(
          currentTweet.inReplyToStatusId
        );
        if (parentTweet) {
          elizaLogger3.debug("Found parent tweet:", {
            id: parentTweet.id,
            text: parentTweet.text?.slice(0, 50)
          });
          await processThread(parentTweet, depth + 1);
        } else {
          elizaLogger3.debug(
            "No parent tweet found for:",
            currentTweet.inReplyToStatusId
          );
        }
      } catch (error) {
        elizaLogger3.error("Error fetching parent tweet:", {
          tweetId: currentTweet.inReplyToStatusId,
          error
        });
      }
    } else {
      elizaLogger3.debug(
        "Reached end of reply chain at:",
        currentTweet.id
      );
    }
  }
  await processThread(tweet, 0);
  elizaLogger3.debug("Final thread built:", {
    totalTweets: thread.length,
    tweetIds: thread.map((t) => ({
      id: t.id,
      text: t.text?.slice(0, 50)
    }))
  });
  return thread;
}
async function sendTweet(client, content, roomId, twitterUsername, inReplyTo) {
  const maxTweetLength = client.twitterConfig.MAX_TWEET_LENGTH;
  const isLongTweet = maxTweetLength > 280;
  const tweetChunks = splitTweetContent(content.text, maxTweetLength);
  const sentTweets = [];
  let previousTweetId = inReplyTo;
  for (const chunk of tweetChunks) {
    let mediaData;
    if (content.attachments && content.attachments.length > 0) {
      mediaData = await Promise.all(
        content.attachments.map(async (attachment) => {
          if (/^(http|https):\/\//.test(attachment.url)) {
            const response = await fetch(attachment.url);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch file: ${attachment.url}`
              );
            }
            const mediaBuffer = Buffer.from(
              await response.arrayBuffer()
            );
            const mediaType = attachment.contentType;
            return { data: mediaBuffer, mediaType };
          } else if (fs.existsSync(attachment.url)) {
            const mediaBuffer = await fs.promises.readFile(
              path2.resolve(attachment.url)
            );
            const mediaType = attachment.contentType;
            return { data: mediaBuffer, mediaType };
          } else {
            throw new Error(
              `File not found: ${attachment.url}. Make sure the path is correct.`
            );
          }
        })
      );
    }
    const result = await client.requestQueue.add(
      async () => isLongTweet ? client.twitterClient.sendLongTweet(chunk.trim(), previousTweetId, mediaData) : client.twitterClient.sendTweet(chunk.trim(), previousTweetId, mediaData)
    );
    const body = await result.json();
    const tweetResult = isLongTweet ? body.data.notetweet_create.tweet_results.result : body.data.create_tweet.tweet_results.result;
    if (tweetResult) {
      const finalTweet = {
        id: tweetResult.rest_id,
        text: tweetResult.legacy.full_text,
        conversationId: tweetResult.legacy.conversation_id_str,
        timestamp: new Date(tweetResult.legacy.created_at).getTime() / 1e3,
        userId: tweetResult.legacy.user_id_str,
        inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
        permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: []
      };
      sentTweets.push(finalTweet);
      previousTweetId = finalTweet.id ?? "";
    } else {
      elizaLogger3.error("Error sending tweet chunk:", { chunk, response: body });
    }
    await wait(1e3, 2e3);
  }
  const memories = sentTweets.map((tweet) => ({
    id: stringToUuid2(tweet.id + "-" + client.runtime.agentId),
    agentId: client.runtime.agentId,
    userId: client.runtime.agentId,
    content: {
      text: tweet.text,
      source: "twitter",
      url: tweet.permanentUrl,
      inReplyTo: tweet.inReplyToStatusId ? stringToUuid2(
        tweet.inReplyToStatusId + "-" + client.runtime.agentId
      ) : void 0
    },
    roomId,
    embedding: getEmbeddingZeroVector2(),
    createdAt: tweet.timestamp ?? 0 * 1e3
  }));
  return memories;
}
function splitTweetContent(content, maxLength) {
  const paragraphs = content.split("\n\n").map((p) => p.trim());
  const tweets = [];
  let currentTweet = "";
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
      if (currentTweet) {
        currentTweet += "\n\n" + paragraph;
      } else {
        currentTweet = paragraph;
      }
    } else {
      if (currentTweet) {
        tweets.push(currentTweet.trim());
      }
      if (paragraph.length <= maxLength) {
        currentTweet = paragraph;
      } else {
        const chunks = splitParagraph(paragraph, maxLength);
        tweets.push(...chunks.slice(0, -1));
        currentTweet = chunks[chunks.length - 1];
      }
    }
  }
  if (currentTweet) {
    tweets.push(currentTweet.trim());
  }
  return tweets;
}
function splitParagraph(paragraph, maxLength) {
  const sentences = paragraph.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [
    paragraph
  ];
  const chunks = [];
  let currentChunk = "";
  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).trim().length <= maxLength) {
      if (currentChunk) {
        currentChunk += " " + sentence;
      } else {
        currentChunk = sentence;
      }
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (sentence.length <= maxLength) {
        currentChunk = sentence;
      } else {
        const words = sentence.split(" ");
        currentChunk = "";
        for (const word of words) {
          if ((currentChunk + " " + word).trim().length <= maxLength) {
            if (currentChunk) {
              currentChunk += " " + word;
            } else {
              currentChunk = word;
            }
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = word;
          }
        }
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// src/light_twitter-clients/interactions.ts
var twitterMessageHandlerTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

# TASK: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
{{actionNames}}
{{actions}}

Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
{{currentPost}}
` + messageCompletionFooter;
var messageHandlerTemplate = (
  // {{goals}}
  // "# Action Examples" is already included
  `{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
` + messageCompletionFooter
);
var TwitterInteractionClient = class {
  client;
  runtime;
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
  }
  async start() {
    const handleTwitterInteractionsLoop = () => {
      this.handleTwitterInteractions();
      setTimeout(
        handleTwitterInteractionsLoop,
        // Defaults to 2 minutes
        this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1e3
      );
    };
    handleTwitterInteractionsLoop();
  }
  async handleTwitterInteractions() {
    elizaLogger4.log("Checking Twitter interactions");
    const twitterUsername = this.client.profile?.username;
    try {
      const mentionCandidates = (await this.client.fetchSearchTweets(
        `@${twitterUsername}`,
        20,
        SearchMode2.Latest
      )).tweets;
      elizaLogger4.log(
        "Completed checking mentioned tweets:",
        mentionCandidates.length
      );
      let uniqueTweetCandidates = [...mentionCandidates];
      if (this.client.twitterConfig.TWITTER_TARGET_USERS.length) {
        const TARGET_USERS = this.client.twitterConfig.TWITTER_TARGET_USERS;
        elizaLogger4.log("Processing target users:", TARGET_USERS);
        if (TARGET_USERS.length > 0) {
          const tweetsByUser = /* @__PURE__ */ new Map();
          for (const username of TARGET_USERS) {
            try {
              const userTweets = (await this.client.twitterClient.fetchSearchTweets(
                `from:${username}`,
                3,
                SearchMode2.Latest
              )).tweets;
              const validTweets = userTweets.filter((tweet) => {
                const isUnprocessed = !this.client.lastCheckedTweetId || parseInt(tweet.id ?? "") > this.client.lastCheckedTweetId;
                const isRecent = Date.now() - (tweet.timestamp ?? 0) * 1e3 < 2 * 60 * 60 * 1e3;
                elizaLogger4.log(`Tweet ${tweet.id} checks:`, {
                  isUnprocessed,
                  isRecent,
                  isReply: tweet.isReply,
                  isRetweet: tweet.isRetweet
                });
                return isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent;
              });
              if (validTweets.length > 0) {
                tweetsByUser.set(username, validTweets);
                elizaLogger4.log(
                  `Found ${validTweets.length} valid tweets from ${username}`
                );
              }
            } catch (error) {
              elizaLogger4.error(
                `Error fetching tweets for ${username}:`,
                error
              );
              continue;
            }
          }
          const selectedTweets = [];
          for (const [username, tweets] of tweetsByUser) {
            if (tweets.length > 0) {
              const randomTweet = tweets[Math.floor(Math.random() * tweets.length)];
              selectedTweets.push(randomTweet);
              elizaLogger4.log(
                `Selected tweet from ${username}: ${randomTweet.text?.substring(0, 100)}`
              );
            }
          }
          uniqueTweetCandidates = [
            ...mentionCandidates,
            ...selectedTweets
          ];
        }
      } else {
        elizaLogger4.log(
          "No target users configured, processing only mentions"
        );
      }
      uniqueTweetCandidates.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
      for (const tweet of uniqueTweetCandidates) {
        if (!this.client.lastCheckedTweetId || BigInt(tweet.id ?? "") > this.client.lastCheckedTweetId) {
          const tweetId = stringToUuid3(
            tweet.id + "-" + this.runtime.agentId
          );
          const existingResponse = await this.runtime.messageManager.getMemoryById(
            tweetId
          );
          if (existingResponse) {
            elizaLogger4.log(
              `Already responded to tweet ${tweet.id}, skipping`
            );
            continue;
          }
          elizaLogger4.log("New Tweet found", tweet.permanentUrl);
          const roomId = stringToUuid3(
            tweet.conversationId + "-" + this.runtime.agentId
          );
          const userIdUUID = tweet.userId === this.client.profile?.id ? this.runtime.agentId : stringToUuid3(tweet.userId);
          await this.runtime.ensureConnection(
            userIdUUID,
            roomId,
            tweet.username,
            tweet.name,
            "twitter"
          );
          const thread = await buildConversationThread(
            tweet,
            this.client
          );
          const message = {
            content: { text: tweet.text },
            agentId: this.runtime.agentId,
            userId: userIdUUID,
            roomId
          };
          await this.handleTweet({
            tweet,
            message,
            thread
          });
          this.client.lastCheckedTweetId = BigInt(tweet.id ?? "");
        }
      }
      await this.client.cacheLatestCheckedTweetId();
      elizaLogger4.log("Finished checking Twitter interactions");
    } catch (error) {
      elizaLogger4.error("Error handling Twitter interactions:", error);
    }
  }
  async handleTweet({
    tweet,
    message,
    thread
  }) {
    if (!message.content.text) {
      elizaLogger4.log("Skipping Tweet with no text", tweet.id);
      return { text: "", action: "IGNORE" };
    }
    elizaLogger4.log("Processing Tweet: ", tweet.id);
    const formatTweet = (tweet2) => {
      return `  ID: ${tweet2.id}
  From: ${tweet2.name} (@${tweet2.username})
  Text: ${tweet2.text}`;
    };
    const currentPost = formatTweet(tweet);
    elizaLogger4.debug("Thread: ", thread);
    const formattedConversation = thread.map(
      (tweet2) => `@${tweet2.username} (${new Date(
        (tweet2.timestamp ?? 0) * 1e3
      ).toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric"
      })}):
        ${tweet2.text}`
    ).join("\n\n");
    elizaLogger4.debug("formattedConversation: ", formattedConversation);
    let state = await this.runtime.composeState(message, {
      twitterClient: this.client.twitterClient,
      twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
      currentPost,
      formattedConversation
    });
    const tweetId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    const tweetExists = await this.runtime.messageManager.getMemoryById(tweetId);
    if (!tweetExists) {
      elizaLogger4.log("tweet does not exist, saving");
      const userIdUUID = stringToUuid3(tweet.userId);
      const roomId = stringToUuid3(tweet.conversationId ?? "");
      const message2 = {
        id: tweetId,
        agentId: this.runtime.agentId,
        content: {
          text: tweet.text,
          url: tweet.permanentUrl,
          inReplyTo: tweet.inReplyToStatusId ? stringToUuid3(
            tweet.inReplyToStatusId + "-" + this.runtime.agentId
          ) : void 0
        },
        userId: userIdUUID,
        roomId,
        createdAt: (tweet.timestamp ?? 0) * 1e3
      };
      this.client.saveRequestMessage(message2, state);
    }
    const context = composeContext2({
      state,
      template: (
        // this.runtime.character.templates
        //     ?.messageHandlerTemplate ||
        // this.runtime.character?.templates?.messageHandlerTemplate ||
        messageHandlerTemplate
      )
    });
    elizaLogger4.debug("Interactions prompt:\n" + context);
    const response = await generateMessageResponse({
      runtime: this.runtime,
      context,
      modelClass: ModelClass2.LARGE
    });
    const removeQuotes = (str) => str.replace(/^['"](.*)['"]$/, "$1");
    const stringId = stringToUuid3(tweet.id + "-" + this.runtime.agentId);
    response.inReplyTo = stringId;
    response.text = removeQuotes(response.text);
    if (response.text) {
      try {
        const callback = async (response2) => {
          const memories = await sendTweet(
            this.client,
            response2,
            message.roomId,
            this.client.twitterConfig.TWITTER_USERNAME,
            tweet.id ?? ""
          );
          return memories;
        };
        const responseMessages = await callback(response);
        state = await this.runtime.updateRecentMessageState(
          state
        );
        for (const responseMessage of responseMessages) {
          if (responseMessage === responseMessages[responseMessages.length - 1]) {
            responseMessage.content.action = response.action;
          } else {
            responseMessage.content.action = "CONTINUE";
          }
          await this.runtime.messageManager.createMemory(
            responseMessage
          );
        }
        await this.runtime.processActions(
          message,
          responseMessages,
          state,
          callback
        );
        const responseInfo = `Context:

${context}

Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}
Agent's Output:
${response.text}`;
        await this.runtime.cacheManager.set(
          `twitter/tweet_generation_${tweet.id}.txt`,
          responseInfo
        );
        await wait();
      } catch (error) {
        elizaLogger4.error(`Error sending response tweet: ${error}`);
      }
    }
  }
  async buildConversationThread(tweet, maxReplies = 10) {
    const thread = [];
    const visited = /* @__PURE__ */ new Set();
    const processThread = async (currentTweet, depth = 0) => {
      elizaLogger4.log("Processing tweet:", {
        id: currentTweet.id,
        inReplyToStatusId: currentTweet.inReplyToStatusId,
        depth
      });
      if (!currentTweet) {
        elizaLogger4.log("No current tweet found for thread building");
        return;
      }
      if (depth >= maxReplies) {
        elizaLogger4.log("Reached maximum reply depth", depth);
        return;
      }
      const memory = await this.runtime.messageManager.getMemoryById(
        stringToUuid3(currentTweet.id + "-" + this.runtime.agentId)
      );
      if (!memory) {
        const roomId = stringToUuid3(
          currentTweet.conversationId + "-" + this.runtime.agentId
        );
        const userId = stringToUuid3(currentTweet.userId ?? "");
        await this.runtime.ensureConnection(
          userId,
          roomId,
          currentTweet.username,
          currentTweet.name,
          "twitter"
        );
        this.runtime.messageManager.createMemory({
          id: stringToUuid3(
            currentTweet.id + "-" + this.runtime.agentId
          ),
          agentId: this.runtime.agentId,
          content: {
            text: currentTweet.text ?? "",
            source: "twitter",
            url: currentTweet.permanentUrl,
            inReplyTo: currentTweet.inReplyToStatusId ? stringToUuid3(
              currentTweet.inReplyToStatusId + "-" + this.runtime.agentId
            ) : void 0
          },
          createdAt: (currentTweet.timestamp ?? 0) * 1e3,
          roomId,
          userId: currentTweet.userId === this.client.profile?.id ? this.runtime.agentId : stringToUuid3(currentTweet.userId ?? ""),
          embedding: getEmbeddingZeroVector3()
        });
      }
      if (visited.has(currentTweet.id ?? "")) {
        elizaLogger4.log("Already visited tweet:", currentTweet.id);
        return;
      }
      visited.add(currentTweet.id ?? "");
      thread.unshift(currentTweet);
      elizaLogger4.debug("Current thread state:", {
        length: thread.length,
        currentDepth: depth,
        tweetId: currentTweet.id
      });
      if (currentTweet.inReplyToStatusId) {
        elizaLogger4.log(
          "Fetching parent tweet:",
          currentTweet.inReplyToStatusId
        );
        try {
          const parentTweet = await this.client.twitterClient.getTweet(
            currentTweet.inReplyToStatusId
          );
          if (parentTweet) {
            elizaLogger4.log("Found parent tweet:", {
              id: parentTweet.id,
              text: parentTweet.text?.slice(0, 50)
            });
            await processThread(parentTweet, depth + 1);
          } else {
            elizaLogger4.log(
              "No parent tweet found for:",
              currentTweet.inReplyToStatusId
            );
          }
        } catch (error) {
          elizaLogger4.log("Error fetching parent tweet:", {
            tweetId: currentTweet.inReplyToStatusId,
            error
          });
        }
      } else {
        elizaLogger4.log(
          "Reached end of reply chain at:",
          currentTweet.id
        );
      }
    };
    await processThread.bind(this)(tweet, 0);
    elizaLogger4.debug("Final thread built:", {
      totalTweets: thread.length,
      tweetIds: thread.map((t) => ({
        id: t.id,
        text: t.text?.slice(0, 50)
      }))
    });
    return thread;
  }
};

// src/light_twitter-clients/post.ts
import {
  getEmbeddingZeroVector as getEmbeddingZeroVector4,
  stringToUuid as stringToUuid4
} from "@elizaos/core";
import { elizaLogger as elizaLogger5 } from "@elizaos/core";
import { postActionResponseFooter } from "@elizaos/core";
var twitterActionTemplate = `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.` + postActionResponseFooter;
function truncateToCompleteSentence(text, maxTweetLength) {
  if (text.length <= maxTweetLength) {
    return text;
  }
  const lastPeriodIndex = text.lastIndexOf(".", maxTweetLength - 1);
  if (lastPeriodIndex !== -1) {
    const truncatedAtPeriod = text.slice(0, lastPeriodIndex + 1).trim();
    if (truncatedAtPeriod.length > 0) {
      return truncatedAtPeriod;
    }
  }
  const lastSpaceIndex = text.lastIndexOf(" ", maxTweetLength - 1);
  if (lastSpaceIndex !== -1) {
    const truncatedAtSpace = text.slice(0, lastSpaceIndex).trim();
    if (truncatedAtSpace.length > 0) {
      return truncatedAtSpace + "...";
    }
  }
  const hardTruncated = text.slice(0, maxTweetLength - 3).trim();
  return hardTruncated + "...";
}
var TwitterPostClient = class {
  client;
  runtime;
  twitterUsername;
  isProcessing = false;
  lastProcessTime = 0;
  stopProcessingActions = false;
  isDryRun;
  constructor(client, runtime) {
    this.client = client;
    this.runtime = runtime;
    this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
    this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    elizaLogger5.log("Twitter Client Configuration:");
    elizaLogger5.log(`- Username: ${this.twitterUsername}`);
    elizaLogger5.log(
      `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
    );
    elizaLogger5.log(
      `- Post Interval: ${this.client.twitterConfig.POST_INTERVAL_MIN}-${this.client.twitterConfig.POST_INTERVAL_MAX} minutes`
    );
    elizaLogger5.log(
      `- Action Processing: ${this.client.twitterConfig.ENABLE_ACTION_PROCESSING ? "enabled" : "disabled"}`
    );
    elizaLogger5.log(
      `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
    );
    elizaLogger5.log(
      `- Post Immediately: ${this.client.twitterConfig.POST_IMMEDIATELY ? "enabled" : "disabled"}`
    );
    elizaLogger5.log(
      `- Search Enabled: ${this.client.twitterConfig.TWITTER_SEARCH_ENABLE ? "enabled" : "disabled"}`
    );
    const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
    if (targetUsers) {
      elizaLogger5.log(`- Target Users: ${targetUsers}`);
    }
    if (this.isDryRun) {
      elizaLogger5.log(
        "Twitter client initialized in dry run mode - no actual tweets should be posted"
      );
    }
  }
  async start() {
    if (!this.client.profile) {
      await this.client.init();
    }
    try {
      const roomId = stringToUuid4(
        "twitter_generate_room-" + this.client.profile?.username
      );
      const date = new Date(Date.now());
      const content = "AI Agent starts!!! at " + date.toLocaleString();
      elizaLogger5.log(`Posting new tweet:
 ${content}`);
      this.postTweet(
        this.runtime,
        this.client,
        content,
        roomId,
        content,
        this.twitterUsername
      );
    } catch (error) {
      elizaLogger5.error("Error sending tweet:", error);
    }
  }
  createTweetObject(tweetResult, client, twitterUsername) {
    return {
      id: tweetResult.rest_id,
      name: client.profile.screenName,
      username: client.profile.username,
      text: tweetResult.legacy.full_text,
      conversationId: tweetResult.legacy.conversation_id_str,
      createdAt: tweetResult.legacy.created_at,
      timestamp: new Date(tweetResult.legacy.created_at).getTime(),
      userId: client.profile.id,
      inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
      permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
      hashtags: [],
      mentions: [],
      photos: [],
      thread: [],
      urls: [],
      videos: []
    };
  }
  async processAndCacheTweet(runtime, client, tweet, roomId, newTweetContent) {
    await runtime.cacheManager.set(
      `twitter/${client.profile?.username}/lastPost`,
      {
        id: tweet.id,
        timestamp: Date.now()
      }
    );
    await client.cacheTweet(tweet);
    elizaLogger5.log(`Tweet posted:
 ${tweet.permanentUrl}`);
    await runtime.ensureRoomExists(roomId);
    await runtime.ensureParticipantInRoom(runtime.agentId, roomId);
    await runtime.messageManager.createMemory({
      id: stringToUuid4(tweet.id + "-" + runtime.agentId),
      userId: runtime.agentId,
      agentId: runtime.agentId,
      content: {
        text: newTweetContent.trim(),
        url: tweet.permanentUrl,
        source: "twitter"
      },
      roomId,
      embedding: getEmbeddingZeroVector4(),
      createdAt: tweet.timestamp
    });
  }
  async handleNoteTweet(client, runtime, content, tweetId) {
    try {
      const noteTweetResult = await client.requestQueue.add(
        async () => await client.twitterClient.sendNoteTweet(content, tweetId)
      );
      if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
        const truncateContent = truncateToCompleteSentence(
          content,
          this.client.twitterConfig.MAX_TWEET_LENGTH
        );
        return await this.sendStandardTweet(
          client,
          truncateContent,
          tweetId
        );
      } else {
        return noteTweetResult.data.notetweet_create.tweet_results.result;
      }
    } catch (error) {
      throw new Error(`Note Tweet failed: ${error}`);
    }
  }
  async sendStandardTweet(client, content, tweetId) {
    try {
      const standardTweetResult = await client.requestQueue.add(
        async () => await client.twitterClient.sendTweet(content, tweetId)
      );
      const body = await standardTweetResult.json();
      if (!body?.data?.create_tweet?.tweet_results?.result) {
        console.error("Error sending tweet; Bad response:", body);
        return;
      }
      return body.data.create_tweet.tweet_results.result;
    } catch (error) {
      elizaLogger5.error("Error sending standard Tweet:", error);
      throw error;
    }
  }
  async postTweet(runtime, client, cleanedContent, roomId, newTweetContent, twitterUsername) {
    try {
      elizaLogger5.log(`Posting new tweet:
`);
      let result;
      if (cleanedContent.length > DEFAULT_MAX_TWEET_LENGTH) {
        result = await this.handleNoteTweet(
          client,
          runtime,
          cleanedContent
        );
      } else {
        result = await this.sendStandardTweet(client, cleanedContent);
      }
      const tweet = this.createTweetObject(
        result,
        client,
        twitterUsername
      );
      await this.processAndCacheTweet(
        runtime,
        client,
        tweet,
        roomId,
        newTweetContent
      );
    } catch (error) {
      elizaLogger5.error("Error sending tweet:", error);
    }
  }
  async stop() {
    this.stopProcessingActions = true;
  }
};

// src/light_twitter-clients/index.ts
var TwitterManager = class {
  client;
  post;
  interaction;
  constructor(runtime, twitterConfig) {
    this.client = new ClientBase(runtime, twitterConfig);
    this.post = new TwitterPostClient(this.client, runtime);
    this.interaction = new TwitterInteractionClient(this.client, runtime);
  }
};
var TwitterClientInterface = {
  async start(runtime) {
    const twitterConfig = await validateTwitterConfig(runtime);
    elizaLogger6.log("Twitter client started");
    const manager = new TwitterManager(runtime, twitterConfig);
    await manager.client.init();
    await manager.post.start();
    await manager.interaction.start();
    return manager;
  },
  async stop(_runtime) {
    elizaLogger6.warn("Twitter client does not support stopping yet");
  }
};

// src/clients/index.ts
async function initializeClients(character2, runtime) {
  const clients = [];
  const clientTypes = character2.clients?.map((str) => str.toLowerCase()) || [];
  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) clients.push(autoClient);
  }
  if (clientTypes.includes("twitter")) {
    const twitterClients = await TwitterClientInterface.start(runtime);
    clients.push(twitterClients);
  }
  if (character2.plugins?.length > 0) {
    for (const plugin of character2.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }
  return clients;
}

// src/config/index.ts
import { ModelProviderName as ModelProviderName2, settings as settings2, validateCharacterConfig } from "@elizaos/core";
import fs2 from "fs";
import path3 from "path";
import yargs from "yargs";
function parseArguments() {
  try {
    return yargs(process.argv.slice(2)).option("character", {
      type: "string",
      description: "Path to the character JSON file"
    }).option("characters", {
      type: "string",
      description: "Comma separated list of paths to character JSON files"
    }).parseSync();
  } catch (error) {
    console.error("Error parsing arguments:", error);
    return {};
  }
}
async function loadCharacters(charactersArg) {
  let characterPaths = charactersArg?.split(",").map((filePath) => {
    if (path3.basename(filePath) === filePath) {
      filePath = "../characters/" + filePath;
    }
    return path3.resolve(process.cwd(), filePath.trim());
  });
  const loadedCharacters = [];
  if (characterPaths?.length > 0) {
    for (const path6 of characterPaths) {
      try {
        const character2 = JSON.parse(fs2.readFileSync(path6, "utf8"));
        validateCharacterConfig(character2);
        loadedCharacters.push(character2);
      } catch (e) {
        console.error(`Error loading character from ${path6}: ${e}`);
        process.exit(1);
      }
    }
  }
  return loadedCharacters;
}
function getTokenForProvider(provider, character2) {
  switch (provider) {
    case ModelProviderName2.OPENAI:
      return character2.settings?.secrets?.OPENAI_API_KEY || settings2.OPENAI_API_KEY;
    case ModelProviderName2.GOOGLE:
      return character2.settings?.secrets?.GEMINI_API_KEY || settings2.GEMINI_API_KEY;
    case ModelProviderName2.LLAMACLOUD:
      return character2.settings?.secrets?.LLAMACLOUD_API_KEY || settings2.LLAMACLOUD_API_KEY || character2.settings?.secrets?.TOGETHER_API_KEY || settings2.TOGETHER_API_KEY || character2.settings?.secrets?.XAI_API_KEY || settings2.XAI_API_KEY || character2.settings?.secrets?.OPENAI_API_KEY || settings2.OPENAI_API_KEY;
    case ModelProviderName2.ANTHROPIC:
      return character2.settings?.secrets?.ANTHROPIC_API_KEY || character2.settings?.secrets?.CLAUDE_API_KEY || settings2.ANTHROPIC_API_KEY || settings2.CLAUDE_API_KEY;
    case ModelProviderName2.REDPILL:
      return character2.settings?.secrets?.REDPILL_API_KEY || settings2.REDPILL_API_KEY;
    case ModelProviderName2.OPENROUTER:
      return character2.settings?.secrets?.OPENROUTER || settings2.OPENROUTER_API_KEY;
    case ModelProviderName2.GROK:
      return character2.settings?.secrets?.GROK_API_KEY || settings2.GROK_API_KEY;
    case ModelProviderName2.HEURIST:
      return character2.settings?.secrets?.HEURIST_API_KEY || settings2.HEURIST_API_KEY;
    case ModelProviderName2.GROQ:
      return character2.settings?.secrets?.GROQ_API_KEY || settings2.GROQ_API_KEY;
  }
}

// src/database/index.ts
import { PostgresDatabaseAdapter } from "@elizaos/adapter-postgres";
import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import Database from "better-sqlite3";
import path4 from "path";
function initializeDatabase(dataDir) {
  if (process.env.POSTGRES_URL) {
    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL
    });
    return db;
  } else {
    const filePath = process.env.SQLITE_FILE ?? path4.resolve(dataDir, "db.sqlite");
    const db = new SqliteDatabaseAdapter(new Database(filePath));
    return db;
  }
}

// src/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path5.dirname(__filename);
var wait2 = (minTime = 1e3, maxTime = 3e3) => {
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};
var nodePlugin;
function createAgent(character2, db, cache, token) {
  elizaLogger7.success(
    elizaLogger7.successesTitle,
    "Creating runtime for character",
    character2.name
  );
  nodePlugin ??= createNodePlugin();
  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character2.modelProvider,
    evaluators: [],
    character: character2,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
      getGiftPlugin,
      evmPlugin
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache
  });
}
async function startAgent(character2, directClient) {
  try {
    character2.id ??= stringToUuid5(character2.name);
    character2.username ??= character2.name;
    const token = getTokenForProvider(character2.modelProvider, character2);
    console.log(`Token provider is ${character2.modelProvider}`);
    if (!token) {
      throw new Error("Token not found for provider");
    }
    const dataDir = path5.join(__dirname, "../data");
    if (!fs3.existsSync(dataDir)) {
      fs3.mkdirSync(dataDir, { recursive: true });
    }
    const db = initializeDatabase(dataDir);
    await db.init();
    const cache = initializeDbCache(character2, db);
    const runtime = createAgent(character2, db, cache, token);
    await runtime.initialize();
    runtime.clients = await initializeClients(character2, runtime);
    directClient.registerAgent(runtime);
    elizaLogger7.debug(`Started ${character2.name} as ${runtime.agentId}`);
    return runtime;
  } catch (error) {
    elizaLogger7.error(
      `Error starting agent for character ${character2.name}:`,
      error
    );
    console.error(error);
    throw error;
  }
}
var checkPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};
var startAgents = async () => {
  const directClient = new DirectClient();
  let serverPort = parseInt(settings3.SERVER_PORT || "3000");
  const args = parseArguments();
  let charactersArg = args.characters || args.character;
  let characters = [character];
  console.log("charactersArg", charactersArg);
  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }
  console.log("characters", characters);
  try {
    for (const character2 of characters) {
      await startAgent(character2, directClient);
    }
  } catch (error) {
    elizaLogger7.error("Error starting agents:", error);
  }
  while (!await checkPortAvailable(serverPort)) {
    elizaLogger7.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
    serverPort++;
  }
  directClient.startAgent = async (character2) => {
    return startAgent(character2, directClient);
  };
  directClient.start(serverPort);
  if (serverPort !== parseInt(settings3.SERVER_PORT || "3000")) {
    elizaLogger7.log(`Server started on alternate port ${serverPort}`);
  }
  const isDaemonProcess = process.env.DAEMON_PROCESS === "true";
  if (!isDaemonProcess) {
    elizaLogger7.log("Chat started. Type 'exit' to quit.");
    const chat = startChat(characters);
    chat();
  }
};
startAgents().catch((error) => {
  elizaLogger7.error("Unhandled error in startAgents:", error);
  process.exit(1);
});
export {
  createAgent,
  wait2 as wait
};
