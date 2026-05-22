import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'uniteam-backend', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});
