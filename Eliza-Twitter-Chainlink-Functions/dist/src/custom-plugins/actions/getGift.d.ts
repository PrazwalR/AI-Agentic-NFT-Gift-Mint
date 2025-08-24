/**
 * @fileoverview This file contains the implementation of the GetGiftAction class and the getGiftAction handler.
 * It interacts with a smart contract on the Avalanche Fuji testnet to send a gift request.
 */
import { Action } from "@elizaos/core";
import { WalletProvider } from "../providers/wallet.ts";
import type { GetGiftParams, Transaction } from "../types/index.ts";
/**
 * Class representing the GetGiftAction.
 */
export declare class GetGiftAction {
    private walletProvider;
    /**
     * Creates an instance of GetGiftAction.
     * @param {WalletProvider} walletProvider - The wallet provider instance.
     */
    constructor(walletProvider: WalletProvider);
    /**
     * Sends a gift request to the smart contract.
     * @param {GetGiftParams} params - The parameters for the gift request.
     * @returns {Promise<Transaction>} The transaction details.
     * @throws Will throw an error if contract address, slot ID, version, or subscription ID is not set.
     */
    getGift(params: GetGiftParams): Promise<Transaction>;
}
/**
 * The getGiftAction handler.
 * @type {Action}
 */
export declare const getGiftAction: Action;
