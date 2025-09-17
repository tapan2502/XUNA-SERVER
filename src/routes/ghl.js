
import express from 'express';
import { ghlController } from '../controllers/ghlController.js';

const router = express.Router();

router.post('/book', ghlController.bookSlot);

export default router;
