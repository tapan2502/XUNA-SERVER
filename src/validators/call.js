import Joi from "joi";

export const initiateCallSchema = Joi.object({
  agent_id: Joi.string().required(),
  from_number: Joi.string().required(),
  to_number: Joi.string().required(),
});

export const outboundCallSchema = Joi.object({
  agentId: Joi.string().required(),
  to_number: Joi.string().required(),
  agent_phone_number_id: Joi.string().required(),
});
