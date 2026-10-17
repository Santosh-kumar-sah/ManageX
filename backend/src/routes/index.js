import { Router } from 'express';
import { healthRouter } from './health.js';
import { readyRouter } from './ready.js';

export const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/ready', readyRouter);
