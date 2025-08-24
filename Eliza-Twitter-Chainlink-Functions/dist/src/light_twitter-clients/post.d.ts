import { Tweet } from "agent-twitter-client";
import { IAgentRuntime, UUID } from "@elizaos/core";
import { ClientBase } from "./base.ts";
export declare const twitterActionTemplate: string;
export declare class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isProcessing;
    private lastProcessTime;
    private stopProcessingActions;
    private isDryRun;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    start(): Promise<void>;
    createTweetObject(tweetResult: any, client: any, twitterUsername: string): Tweet;
    processAndCacheTweet(runtime: IAgentRuntime, client: ClientBase, tweet: Tweet, roomId: UUID, newTweetContent: string): Promise<void>;
    handleNoteTweet(client: ClientBase, runtime: IAgentRuntime, content: string, tweetId?: string): Promise<any>;
    sendStandardTweet(client: ClientBase, content: string, tweetId?: string): Promise<any>;
    postTweet(runtime: IAgentRuntime, client: ClientBase, cleanedContent: string, roomId: UUID, newTweetContent: string, twitterUsername: string): Promise<void>;
    stop(): Promise<void>;
}
