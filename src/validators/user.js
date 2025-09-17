
import Joi from "joi";

export const deleteUserSchema = Joi.object({
  currentUserId: Joi.string().required(),
  targetUserId: Joi.string().required(),
});