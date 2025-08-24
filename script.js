import { SecretsManager, SubscriptionManager } from "@chainlink/functions-toolkit"
import { ethers } from "ethers"

const functionsRouterAddress = "0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0" // Fuji
const donId = "fun-avalanche-fuji-1" // Fuji
const linkTokenAddress = "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846" // Fuji
const LINK_AMOUNT = "0.000001"

const GATEWAY_URLS = [
    "https://01.functions-gateway.testnet.chain.link/",
    "https://02.functions-gateway.testnet.chain.link/"
] // Fuji

let provider, signer

// initialize
async function init() {
    provider = new ethers.providers.Web3Provider(window.ethereum)
    await provider.send("eth_requestAccounts", []) // Ensure Metamask connects
    signer = provider.getSigner()

    // Switch to Avalanche Fuji
    await provider.send("wallet_switchEthereumChain", [{ chainId: '0xA869' }])
    const network = await signer.provider.getNetwork()
    console.log("Connected to network:", network)

    if (!provider || !signer) throw new Error("Missing provider or signer")
    console.info("✅ Connection initialized")
}

const encryptAndUploadSecrets = async () => {
    const secretsManager = new SecretsManager({
        signer,
        functionsRouterAddress,
        donId,
    })
    await secretsManager.initialize()

    const SLOT_ID = 0
    const expirationTimeMinutes = 1440

    const secrets = {
        apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dG5scWpheWt6aXpub2hwdnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MjQ4MTQsImV4cCI6MjA3MDAwMDgxNH0._yaGWZwKoKfsfJGoATd3r5VvWRjQWba1hU_qlCFbgBQ"
    }

    const encryptedSecretsObj = await secretsManager.encryptSecrets(secrets)

    console.log(`Uploading encrypted secrets to gateways...`)

    const uploadResult = await secretsManager.uploadEncryptedSecretsToDON({
        encryptedSecretsHexstring: encryptedSecretsObj.encryptedSecrets,
        gatewayUrls: GATEWAY_URLS,
        slotId: SLOT_ID,
        minutesUntilExpiration: expirationTimeMinutes,
    })

    if (!uploadResult.success)
        throw new Error(`❌ Encrypted secrets not uploaded to ${GATEWAY_URLS}`)

    console.log(`✅ Secrets uploaded. Gateway response:`, uploadResult)

    const donHostedSecretsVersion = parseInt(uploadResult.version)
    console.log(`donHostedSecretsVersion: ${donHostedSecretsVersion}`)
}

const createAndFundSub = async (consumerAddress = undefined) => {
    const subscriptionManager = new SubscriptionManager({
        signer,
        linkTokenAddress,
        functionsRouterAddress,
    })

    await subscriptionManager.initialize()

    const subscriptionId = await subscriptionManager.createSubscription()
    console.log(`✅ Subscription ${subscriptionId} created.`)

    if (consumerAddress) {
        const receipt = await subscriptionManager.addConsumer({
            subscriptionId,
            consumerAddress,
        })
        console.log(`Consumer ${consumerAddress} added. Tx Receipt:`, receipt)
    }

    const juelsAmount = ethers.utils.parseUnits(LINK_AMOUNT, 18).toString()
    console.log(`Funding Subscription ${subscriptionId} with ${juelsAmount} Juels`)

    await subscriptionManager.fundSubscription({
        subscriptionId,
        juelsAmount,
    })

    console.log(`✅ Subscription ${subscriptionId} funded with ${LINK_AMOUNT} LINK.`)
}

async function main() {
    await init()
    await encryptAndUploadSecrets()
    // await createAndFundSub("0xYourConsumerAddress")
}

main().catch((e) => {
    console.error("ERROR:", e)
})
