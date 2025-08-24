import { IAgentRuntime, IImageDescriptionService, Memory, State } from "@elizaos/core";
import { QueryTweetsResponse, Scraper, SearchMode, Tweet } from "agent-twitter-client";
import { EventEmitter } from "events";
import { TwitterConfig } from "./environment.ts";
export declare function extractAnswer(text: string): string;
type TwitterProfile = {
    id: string;
    username: string;
    screenName: string;
    bio: string;
    nicknames: string[];
};
declare class RequestQueue {
    private queue;
    private processing;
    add<T>(request: () => Promise<T>): Promise<T>;
    private processQueue;
    private exponentialBackoff;
    private randomDelay;
}
export declare class ClientBase extends EventEmitter {
    static _twitterClients: {
        [accountIdentifier: string]: Scraper;
    };
    twitterClient: Scraper;
    runtime: IAgentRuntime;
    twitterConfig: TwitterConfig;
    directions: string;
    lastCheckedTweetId: bigint | null;
    imageDescriptionService: IImageDescriptionService;
    temperature: number;
    requestQueue: RequestQueue;
    profile: TwitterProfile | null;
    cacheTweet(tweet: Tweet): Promise<void>;
    getCachedTweet(tweetId: string): Promise<Tweet | undefined>;
    getTweet(tweetId: string): Promise<Tweet>;
    callback: (self: ClientBase) => any;
    onReady(): void;
    constructor(runtime: IAgentRuntime, twitterConfig: TwitterConfig);
    init(): Promise<void>;
    fetchOwnPosts(count: number): Promise<Tweet[]>;
    /**
     * Fetch timeline for twitter account, optionally only from followed accounts
     */
    fetchHomeTimeline(count: number, following?: boolean): Promise<Tweet[]>;
    fetchTimelineForActions(count: number): Promise<Tweet[]>;
    fetchSearchTweets(query: string, maxTweets: number, searchMode: SearchMode, cursor?: string): Promise<QueryTweetsResponse>;
    private populateTimeline;
    setCookiesFromArray(cookiesArray: any[]): Promise<void>;
    saveRequestMessage(message: Memory, state: State): Promise<void>;
    loadLatestCheckedTweetId(): Promise<void>;
    cacheLatestCheckedTweetId(): Promise<void>;
    getCachedTimeline(): Promise<Tweet[] | undefined>;
    cacheTimeline(timeline: Tweet[]): Promise<void>;
    cacheMentions(mentions: Tweet[]): Promise<void>;
    getCachedCookies(username: string): Promise<any[] | undefined>;
    cacheCookies(username: string, cookies: any[]): Promise<void>;
    getCachedProfile(username: string): Promise<TwitterProfile | undefined>;
    cacheProfile(profile: TwitterProfile): Promise<void>;
    fetchProfile(username: string): Promise<TwitterProfile>;
}
export {};
