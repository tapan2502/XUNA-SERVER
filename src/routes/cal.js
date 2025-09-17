
import express from 'express';
import { calController } from '../controllers/calController.js';

const router = express.Router();

router.post('/book', calController.bookSlot);

export default router;
