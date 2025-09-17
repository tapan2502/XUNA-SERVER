import Joi from "joi";

export const getConversationSchema = Joi.object({
  conversation_id: Joi.string().required(),
});
