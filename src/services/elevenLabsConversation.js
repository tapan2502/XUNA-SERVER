import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/conversations";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsConversationService = {
  async listConversations(agentId) {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
        params: {
          agent_id: agentId,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  },

  async getConversation(conversationId) {
    try {
      // Fetch conversation data first
      const conversationResponse = await axios.get(`${ELEVEN_LABS_API_URL}/${conversationId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });

      let audio = null;
      
      // Try to fetch audio, but handle the case where it's not available
      try {
        const audioResponse = await axios.get(`${ELEVEN_LABS_API_URL}/${conversationId}/audio`, {
          headers: {
            "xi-api-key": API_KEY,
          },
          responseType: "arraybuffer",
        });
        audio = Buffer.from(audioResponse.data).toString("base64");
      } catch (audioError) {
        // Check if it's the specific "missing_conversation_audio" error
        if (audioError.response?.status === 404 && 
            audioError.response?.data && 
            Buffer.isBuffer(audioError.response.data)) {
          try {
            const errorData = JSON.parse(audioError.response.data.toString());
            if (errorData.detail?.status === "missing_conversation_audio") {
              console.log(`Audio not available for conversation ${conversationId}: ${errorData.detail.message}`);
              audio = null; // Set audio to null when not available
            } else {
              throw audioError; // Re-throw if it's a different type of error
            }
          } catch (parseError) {
            throw audioError; // Re-throw if we can't parse the error response
          }
        } else {
          throw audioError; // Re-throw if it's not a 404 or doesn't match expected format
        }
      }

      return {
        conversation: conversationResponse.data,
        audio: audio,
      };
    } catch (error) {
      console.error("Error fetching conversation:", error);
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  },
};
