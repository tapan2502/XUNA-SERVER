import { elevenLabsService } from "./src/services/elevenLabs.js";
import { elevenLabsConversationService } from "./src/services/elevenLabsConversation.js";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    console.log("Testing ElevenLabs API Whitespace handling...");

    const validAgentId = "agent_0901kddvkbnhfcr8wvxv6cx9fvbq";
    const whitespaceAgentId = "agent_0901kddvkbnhfcr8wvxv6cx9fvbq ";

    console.log("\n--- Test: List Conversations with Whitespace Agent ID ---");
    try {
        await elevenLabsConversationService.listConversations(whitespaceAgentId);
        console.log("Success! (Unexpected if API is strict)");
    } catch (error) {
        console.log("Error caught:", error.message);
        if (error.message.includes("404")) {
            console.log("-> CONFIRMED: Whitespace causes 404 in listConversations");
        }
    }
}

test();
