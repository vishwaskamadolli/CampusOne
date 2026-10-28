import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/campusone',
  sessionSecret: process.env.JWT_SECRET || process.env.SESSION_SECRET || 'development-only-secret-change-me-123',
  webUrl: process.env.WEB_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFrom: process.env.TWILIO_FROM || '',
};

if (config.nodeEnv === 'production' && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production');
}
