# AI-Agentic-NFT-Gift-Mint

> AI-driven pipeline that mints gift NFTs by combining an agentic LLM, Chainlink Functions, a Web2 database (Supabase) and an EVM smart contract.

---

## Table of contents

* Project overview
* How it works (high level)
* Components and technologies
* End-to-end flow (step-by-step)
* Minimal `.env` guidance
* Security & deployment notes
* Example flow snippets
* Troubleshooting & tips
* Contributing & license

---

## Project overview

**AI-Agentic-NFT-Gift-Mint** is a hybrid Web2/Web3 project that automates minting NFTs as gifts using an AI agent. The agent extracts a user's wallet address and a gift code from conversational input, calls a smart contract which triggers Chainlink Functions to validate the gift code against a Supabase database, and then mints the corresponding NFT to the user.

The design emphasizes:

* a human-friendly conversational interface (the demo uses a CLI AI agent called *Eliza OS*),
* secure off-chain API access and secret handling via Chainlink Functions,
* deterministic on-chain outcomes despite non-deterministic AI behavior.

---

## How it works (high level)

1. A user interacts with the AI agent and provides a gift code plus a wallet address (or the agent extracts the wallet address).
2. The agent sends a transaction to your NFT smart contract, initiating a Chainlink Functions request.
3. Chainlink Functions run off-chain JavaScript that securely queries Supabase to validate the gift code and fetch the gift name.
4. Chainlink returns the verified result to the smart contract; the contract safely mints the appropriate NFT to the recipient's address.

This architecture keeps secrets (Supabase keys, API tokens) off-chain while enabling trusted, auditable mint logic on-chain via a decentralized oracle network (DON).

---

## Components & technologies

* **AI agent** (LLM, e.g., Gemini or OpenAI): extracts user inputs, formats the on-chain request, and optionally generates media/metadata.
* **Smart contract (Solidity, ERC-721/ERC-1155)**: exposes a function (e.g., `requestGift`) that emits an event or calls Chainlink Functions to run off-chain logic.
* **Chainlink Functions**: executes custom JS to interact with external services (Supabase), and returns verifiable results to the contract.
* **Supabase**: stores gift data (`gifts` table with `id`, `gift_name`, `gift_code`) and is queried by Chainlink Functions.
* **IPFS / NFT.Storage / Supabase Storage**: optional storage targets for media and metadata.
* **Frontend / CLI**: the user-facing interface; demo uses CLI but can be extended to web apps, bots, or Twitter/X integrations.
* **Wallets & networks**: MetaMask for users; demo runs on Avalanche Fuji testnet.

---

## End-to-end flow (step-by-step)

1. **User interaction**

   * User chats with the AI agent: e.g., "Eliza, gift code GIFT-123 to my wallet 0xABC..."
   * The agent parses the message and extracts `walletAddress` and `giftCode`.

2. **On-chain request**

   * The agent calls the smart contract's `requestGift(walletAddress, giftCode)` function, optionally attaching metadata or a prompt.

3. **Chainlink Functions execution**

   * The contract initiates a Chainlink Functions request.
   * The request executes off-chain JS that:

     * Receives encrypted secrets (injected by the DON) to access Supabase.
     * Queries Supabase for the `gifts` table to validate `giftCode`.
     * Returns the corresponding `giftName` or an error.

4. **On-chain result & mint**

   * Chainlink returns the verified `giftName` to the contract.
   * The contract maps `giftName` to a token type (e.g., three different NFTs) and performs a `safeMint` to the `walletAddress`.

5. **Post-mint**

   * Optional actions: log to Supabase (audit trail), upload metadata to IPFS, announce on social media.

---

## Minimal `.env` guidance (kept concise)

The project needs secrets for the AI provider, node signer, RPC provider, and optional storage/db APIs. Keep a single minimal paragraph here rather than a long focus on env structure:

* **LLM/API key** (e.g., `GEMINI_API_KEY` or `OPENAI_API_KEY`) — used by the agent for parsing/generation.
* **EVM signer key** (`EVM_PRIVATE_KEY`) — used only server-side to sign on-chain transactions if your agent initiates transactions itself.
* **RPC endpoint** (`ETHEREUM_PROVIDER_...`) — provider URL for Avalanche Fuji or your target chain.
* **Supabase URL & key** (`SUPABASE_URL`, `SUPABASE_API_KEY`) — Supabase is called by Chainlink Functions; secrets for it are uploaded to the Chainlink DON and injected securely at runtime.

> Note: Chainlink Functions is used specifically so **you don't expose Supabase secrets on-chain or in agent logs** — upload them to the DON and let Chainlink inject them at runtime into the off-chain JS.

---

## Security & deployment notes

* **Secrets management**: Never put production DB secrets or private keys into client code or public repos. Use Chainlink Functions secrets for Supabase keys and GitHub Secrets / cloud secret manager for CI.
* **Chain selection**: Start on testnets (Avalanche Fuji) for end-to-end testing before migrating to mainnet.
* **Key management**: For production, prefer multisig (Gnosis Safe) or hardware/managed signers for valuable wallets.
* **Determinism**: Ensure the Chainlink Functions code returns deterministic, well-structured responses (avoid relying on raw AI outputs for on-chain decisions).

---

## Example flow snippets

* **Smart contract (high level)**

```solidity
// Pseudocode
function requestGift(address recipient, string memory giftCode) external {
  // invoke Chainlink Functions with request payload {recipient, giftCode}
}

// callback invoked by Chainlink after off-chain check
function fulfillRequest(bytes memory response, bytes memory err) external {
  // decode response to get giftName
  // map giftName to token id/type and safeMint to recipient
}
```

* **Chainlink Functions (high level)**

```js
// Node code executed by Chainlink
// Secrets injected: process.env.SUPABASE_URL, process.env.SUPABASE_KEY
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { data } = await supabase.from('gifts').select('gift_name').eq('gift_code', giftCode);
// return gift_name or error
```

* **Agent behaviour**

  * Parse chat for wallet and gift code.
  * Optionally validate wallet checksum.
  * Send transaction or call a backend which calls the contract.

---

## Troubleshooting & tips

* **Gift code not found**: Chainlink function should return an explicit error; the contract must handle errors gracefully.
* **Non-deterministic AI**: Do not let raw LLM text decide on-chain conditions. Use AI to **help** craft the off-chain request; rely on deterministic checks (Supabase) for minting decisions.
* **RPC / chain issues**: Switch providers or test on another testnet if RPC is unreliable.
* **Secrets leak**: Rotate keys immediately and audit logs.

---

## Contributing & license

* Open issues and PRs. Keep secrets out of PRs and run tests locally.
* Add a `LICENSE` file (MIT recommended for permissive use).

---

If you'd like, I can:

* export this README as a downloadable `README.md` file in the repo,
* append the Chainlink Functions JavaScript example and a `getgift.sol` contract snippet,
* or produce a minimal frontend CLI script that demonstrates the agent-to-contract flow.

Tell me which of those you'd like next.
