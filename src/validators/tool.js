import Joi from "joi";

export const createToolSchema = Joi.object({
  tool_config: Joi.object({
    api_schema: Joi.object({
      url: Joi.string().uri().required(),
      method: Joi.string().optional(),
      path_params_schema: Joi.object().optional(),
      query_params_schema: Joi.object().optional(),
      request_body_schema: Joi.object().optional(),
      request_headers: Joi.object().optional(),
    }).required(),
    

    description: Joi.string().required(),
    name: Joi.string().required(),
    response_timeout_secs: Joi.number(),
    type: Joi.string().required(),
  }).required(),
});

export const getToolSchema = Joi.object({
  tool_id: Joi.string().required(),
});

export const updateToolSchema = Joi.object({
  tool_id: Joi.string().required(),
  tool_config: Joi.object({
    response_timeout_secs: Joi.number().optional(),
    type: Joi.string().optional(),
    api_schema: Joi.object({
      auth_connection: Joi.object().optional().allow(null),
      url: Joi.string().uri().required(),
      method: Joi.string().optional(),
      path_params_schema: Joi.object().optional().allow(null),
      query_params_schema: Joi.object().optional().allow(null),
      request_body_schema: Joi.object().optional().allow(null),
      request_headers: Joi.object().optional(),
    }).required(),
     disable_interruptions: Joi.boolean().default(false).optional(),
     force_pre_tool_speech: Joi.boolean().default(false).optional(),
    assignments: Joi.array().items(Joi.string()).optional().allow(null),
    dynamic_variables: Joi.object({
      dynamic_variable_placeholders: Joi.object().optional(),
    }).optional(),
    description: Joi.string().required(),
    name: Joi.string().required(),
  }).required(),
});

export const deleteToolSchema = Joi.object({
  tool_id: Joi.string().required(),
});

export const listToolsSchema = Joi.object({});
