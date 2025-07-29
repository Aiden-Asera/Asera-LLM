export class AuthenticationError extends Error {
  public statusCode = 401;
  public code = 'AUTHENTICATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public statusCode = 403;
  public code = 'AUTHORIZATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  public statusCode = 400;
  public code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  public code = 'CONFLICT_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  public statusCode = 429;
  public code = 'RATE_LIMIT_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class PayloadTooLargeError extends Error {
  public statusCode = 413;
  public code = 'PAYLOAD_TOO_LARGE';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
} 