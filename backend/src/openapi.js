export const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'CampusOne ERP API', version: '1.0.0', description: 'Tenant-scoped college management REST API' },
  servers: [{ url: 'http://localhost:4000/api/v1' }],
  paths: {
    '/health': { get: { summary: 'Service health', responses: { 200: { description: 'API is healthy' } } } },
    '/auth/login': { post: { summary: 'Create an authenticated session', requestBody: { required: true }, responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' } } } },
    '/auth/logout': { post: { summary: 'End the current session', responses: { 200: { description: 'Logged out' } } } },
    '/auth/me': { get: { summary: 'Read the current session', responses: { 200: { description: 'Current user' }, 401: { description: 'Not authenticated' } } } },
    '/auth/forgot-password': { post: { summary: 'Request password reset', responses: { 200: { description: 'Request accepted' } } } },
    '/auth/reset-password': { post: { summary: 'Set a new password', responses: { 200: { description: 'Password updated' } } } },
    '/users': { get: { summary: 'List tenant users', responses: { 200: { description: 'Tenant users' } } }, post: { summary: 'Create teacher or parent', responses: { 201: { description: 'Account created' } } } },
  },
};
