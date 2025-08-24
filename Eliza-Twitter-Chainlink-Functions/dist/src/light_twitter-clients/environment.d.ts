import { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";
export declare const DEFAULT_MAX_TWEET_LENGTH = 280;
/**
 * This schema defines all required/optional environment settings,
 * including new fields like TWITTER_SPACES_ENABLE.
 */
export declare const twitterEnvSchema: z.ZodObject<{
    TWITTER_DRY_RUN: z.ZodBoolean;
    TWITTER_USERNAME: z.ZodString;
    TWITTER_PASSWORD: z.ZodString;
    TWITTER_EMAIL: z.ZodString;
    MAX_TWEET_LENGTH: z.ZodDefault<z.ZodNumber>;
    TWITTER_SEARCH_ENABLE: z.ZodDefault<z.ZodBoolean>;
    TWITTER_2FA_SECRET: z.ZodString;
    TWITTER_RETRY_LIMIT: z.ZodNumber;
    TWITTER_POLL_INTERVAL: z.ZodNumber;
    TWITTER_TARGET_USERS: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    POST_INTERVAL_MIN: z.ZodNumber;
    POST_INTERVAL_MAX: z.ZodNumber;
    ENABLE_ACTION_PROCESSING: z.ZodBoolean;
    ACTION_INTERVAL: z.ZodNumber;
    POST_IMMEDIATELY: z.ZodBoolean;
    TWITTER_SPACES_ENABLE: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    TWITTER_DRY_RUN: boolean;
    TWITTER_USERNAME: string;
    TWITTER_PASSWORD: string;
    TWITTER_EMAIL: string;
    MAX_TWEET_LENGTH: number;
    TWITTER_SEARCH_ENABLE: boolean;
    TWITTER_2FA_SECRET: string;
    TWITTER_RETRY_LIMIT: number;
    TWITTER_POLL_INTERVAL: number;
    TWITTER_TARGET_USERS: string[];
    POST_INTERVAL_MIN: number;
    POST_INTERVAL_MAX: number;
    ENABLE_ACTION_PROCESSING: boolean;
    ACTION_INTERVAL: number;
    POST_IMMEDIATELY: boolean;
    TWITTER_SPACES_ENABLE: boolean;
}, {
    TWITTER_DRY_RUN: boolean;
    TWITTER_USERNAME: string;
    TWITTER_PASSWORD: string;
    TWITTER_EMAIL: string;
    TWITTER_2FA_SECRET: string;
    TWITTER_RETRY_LIMIT: number;
    TWITTER_POLL_INTERVAL: number;
    POST_INTERVAL_MIN: number;
    POST_INTERVAL_MAX: number;
    ENABLE_ACTION_PROCESSING: boolean;
    ACTION_INTERVAL: number;
    POST_IMMEDIATELY: boolean;
    MAX_TWEET_LENGTH?: number | undefined;
    TWITTER_SEARCH_ENABLE?: boolean | undefined;
    TWITTER_TARGET_USERS?: string[] | undefined;
    TWITTER_SPACES_ENABLE?: boolean | undefined;
}>;
export type TwitterConfig = z.infer<typeof twitterEnvSchema>;
/**
 * Validates or constructs a TwitterConfig object using zod,
 * taking values from the IAgentRuntime or process.env as needed.
 */
export declare function validateTwitterConfig(runtime: IAgentRuntime): Promise<TwitterConfig>;
