import { Router } from 'express';
import { healthRouter } from './health.js';
import { readyRouter } from './ready.js';
import { authRouter } from './auth.js';
import { organisationsRouter } from './organisations.js';
import { invitationsRouter } from './invitations.js';
import { publicEventsRouter } from './events.js';

export const apiV1Router = Router();

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/ready', readyRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/organisations', organisationsRouter);
apiV1Router.use('/invitations', invitationsRouter);
apiV1Router.use('/events', publicEventsRouter);
