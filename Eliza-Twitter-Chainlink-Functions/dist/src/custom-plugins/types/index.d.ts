import * as viemChains from "viem/chains";
import { Hash, Address } from "viem";
declare const _SupportedChainList: Array<keyof typeof viemChains>;
export type SupportedChain = (typeof _SupportedChainList)[number];
export interface GetGiftParams {
    code: string;
    address: `0x${string}`;
}
export interface Transaction {
    hash: Hash;
    from: Address;
    to: Address;
    value: bigint;
    data?: `0x${string}`;
    chainId?: number;
}
export {};
