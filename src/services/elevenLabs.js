import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/agents";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsService = {
  async createAgent(name, config, params = {}) {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined)
    );

    try {
      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}/create`,
        {
          name: name,
          conversation_config: config,
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
          params: filteredParams,
        },
      );
      return response.data;
    } catch (error) {
      const details =
        error.response?.data ||
        error.response?.statusText ||
        error.message;
      throw new Error(`Failed to create agent: ${JSON.stringify(details)}`);
    }
  },

  async updateAgent(agentId, name, config, platform_settings) {
    try {
      const response = await axios.patch(
        `${ELEVEN_LABS_API_URL}/${agentId}`,
        {
          name: name,
          conversation_config: config,
          platform_settings
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      const details =
        error.response?.data ||
        error.response?.statusText ||
        error.message;
      console.error("ElevenLabs update error details:", JSON.stringify(details, null, 2));
      throw new Error(`Failed to update agent: ${JSON.stringify(details)}`);
    }
  },

  async deleteAgent(agentId) {
    try {
      await axios.delete(`${ELEVEN_LABS_API_URL}/${agentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
    } catch (error) {
      throw new Error(`Failed to delete agent: ${error.message}`);
    }
  },

  async getAgent(agentId) {
    try {
      const response = await axios.get(`${ELEVEN_LABS_API_URL}/${agentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get agent: ${error.message}`);
    }
  },

  async listAgents() {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error listing agents:", error);
      throw new Error(`Failed to list agents: ${error.message}`);
    }
  },
};
