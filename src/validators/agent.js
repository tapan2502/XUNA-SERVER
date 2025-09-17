import Joi from "joi";

export const createAgentSchema = Joi.object({
  name: Joi.string().optional(),
  conversation_config: Joi.object({
    agent: Joi.object().optional(),
    prompt: Joi.object().optional(),
    tools: Joi.array().items(Joi.object()).optional(),
    tool_ids: Joi.array().items(Joi.string()).optional(),
    knowledge_base: Joi.array().items(Joi.object()).optional(),
    knowledge_base_document_ids: Joi.array().items(Joi.string()).optional(),
    custom_llm: Joi.object().optional(),
    first_message: Joi.string().optional(),
    language: Joi.string().optional(),
    dynamic_variables: Joi.object().optional(),
    dynamic_variable_placeholders: Joi.object().optional(),
    asr: Joi.object().optional(),
    turn: Joi.object().optional(),
    tts: Joi.object().optional(),
    conversation: Joi.object().optional(),
  }).required(),
});

export const updateAgentSchema = Joi.object({
  agent_id: Joi.string().required(),
  name: Joi.string().optional(),
  platform_settings: Joi.object({
    data_collection: Joi.object()
      .pattern(
        Joi.string(), // Dynamic key (can be any string)
        Joi.object({
          type: Joi.string()
            .valid("string", "boolean", "number", "integer")
            .required(),
          description: Joi.string().allow("").optional(),
          dynamic_variable: Joi.string().allow("").optional(),
          constant_value: Joi.any().optional(),
        }).required() // Ensure each value matches the structure
      )
      .optional(),
    workspace_overrides: Joi.object({
      conversation_initiation_client_data_webhook: Joi.object({
        request_headers: Joi.object()
          .pattern(Joi.string(), Joi.string())
          .optional(),
        url: Joi.string().uri().allow("").optional(),
      }).optional(),
    }).optional(),
    privacy: Joi.object().optional(),
  }).optional(),
  conversation_config: Joi.object({
    agent: Joi.object().optional(),
    prompt: Joi.object().optional(),
    tools: Joi.array().items(Joi.object()).optional(),
    tool_ids: Joi.array().items(Joi.string()).optional(),
    knowledge_base: Joi.array().items(Joi.object()).optional(),
    knowledge_base_document_ids: Joi.array().items(Joi.string()).optional(),
    custom_llm: Joi.object().optional(),
    first_message: Joi.string().optional(),
    language: Joi.string().optional(),
    dynamic_variables: Joi.object().optional(),
    dynamic_variable_placeholders: Joi.object().optional(),
    asr: Joi.object().optional(),
    turn: Joi.object().optional(),
    tts: Joi.object().optional(),
    conversation: Joi.object().optional(),
  }).optional(),
});

export const getAgentSchema = Joi.object({
  agent_id: Joi.string().required(),
});

export const deleteAgentSchema = Joi.object({
  agent_id: Joi.string().required(),
});

export const listAgentsSchema = Joi.object({});
