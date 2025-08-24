import { Tweet } from "agent-twitter-client";
import { IAgentRuntime } from "@elizaos/core";
import { ClientBase } from "./base.ts";
export declare const twitterMessageHandlerTemplate: string;
export declare const messageHandlerTemplate: string;
export declare class TwitterInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    constructor(client: ClientBase, runtime: IAgentRuntime);
    start(): Promise<void>;
    handleTwitterInteractions(): Promise<void>;
    private handleTweet;
    buildConversationThread(tweet: Tweet, maxReplies?: number): Promise<Tweet[]>;
}
