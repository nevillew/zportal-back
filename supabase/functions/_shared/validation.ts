import { corsHeaders } from './cors.ts';

// Define validation error type
export type ValidationErrors = { [field: string]: string[] };

/**
 * Creates a standardized validation error response (HTTP 422).
 * @param errors - An object where keys are field names and values are arrays of error messages.
 * @returns A Response object formatted for validation errors.
 */
export function createValidationErrorResponse(errors: ValidationErrors): Response {
    console.warn('Validation failed:', JSON.stringify(errors));
    return new Response(
        JSON.stringify({
            message: "Validation failed.",
            errors: errors,
        }),
        {
            status: 422, // Unprocessable Entity
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Creates a generic bad request error response (HTTP 400).
 * @param message - The error message.
 * @returns A Response object formatted for bad requests.
 */
export function createBadRequestResponse(message: string): Response {
    console.warn('Bad request:', message);
    return new Response(
        JSON.stringify({ error: `Bad Request: ${message}` }),
        {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Validates that a value is one of the allowed enum values.
 * @param value - The value to validate.
 * @param allowedValues - Array of allowed values.
 * @param fieldName - Name of the field being validated (for error message).
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateEnum(
    value: unknown, 
    allowedValues: string[], 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null) {
        return true; // Skip validation for undefined/null (use validateRequired for required fields)
    }

    if (!allowedValues.includes(String(value))) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be one of: ${allowedValues.join(', ')}`);
        return false;
    }
    return true;
}

/**
 * Validates that a field is required (not undefined, null, or empty string).
 * @param value - The value to validate.
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateRequired(
    value: unknown, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null || value === '') {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push('This field is required.');
        return false;
    }
    return true;
}

/**
 * Validates string length against min and max constraints.
 * @param value - The string to validate.
 * @param min - Minimum length (optional).
 * @param max - Maximum length (optional).
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateLength(
    value: unknown, 
    min?: number, 
    max?: number, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null) {
        return true; // Skip validation for undefined/null (use validateRequired for required fields)
    }

    const strValue = String(value);
    let isValid = true;

    if (min !== undefined && strValue.length < min) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be at least ${min} characters long.`);
        isValid = false;
    }

    if (max !== undefined && strValue.length > max) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be no more than ${max} characters long.`);
        isValid = false;
    }

    return isValid;
}

/**
 * Validates that a string matches a specific format using a regular expression.
 * @param value - The string to validate.
 * @param pattern - Regular expression pattern.
 * @param formatName - Name of the format (e.g., "email", "URL").
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateFormat(
    value: unknown, 
    pattern: RegExp, 
    formatName: string, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null || value === '') {
        return true; // Skip validation for undefined/null/empty (use validateRequired for required fields)
    }

    const strValue = String(value);
    if (!pattern.test(strValue)) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be a valid ${formatName}.`);
        return false;
    }
    return true;
}

/**
 * Validates that a value is a valid email address.
 * @param value - The value to validate.
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateEmail(
    value: unknown, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return validateFormat(value, emailPattern, 'email address', fieldName, errors);
}

/**
 * Validates that a value is a valid URL.
 * @param value - The value to validate.
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateUrl(
    value: unknown, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    return validateFormat(value, urlPattern, 'URL', fieldName, errors);
}

/**
 * Validates a numeric value against min and max constraints.
 * @param value - The number to validate.
 * @param min - Minimum value (optional).
 * @param max - Maximum value (optional).
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateNumber(
    value: unknown, 
    min?: number, 
    max?: number, 
    fieldName: string, 
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null) {
        return true; // Skip validation for undefined/null (use validateRequired for required fields)
    }

    const numValue = Number(value);
    
    if (isNaN(numValue)) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push('Must be a valid number.');
        return false;
    }

    let isValid = true;

    if (min !== undefined && numValue < min) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be at least ${min}.`);
        isValid = false;
    }

    if (max !== undefined && numValue > max) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be no more than ${max}.`);
        isValid = false;
    }

    return isValid;
}

/**
 * Validates a date string or Date object.
 * @param value - The date to validate (string or Date).
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @param minDate - Optional minimum date.
 * @param maxDate - Optional maximum date.
 * @returns boolean indicating if validation passed.
 */
export function validateDate(
    value: unknown, 
    fieldName: string, 
    errors: ValidationErrors,
    minDate?: Date,
    maxDate?: Date
): boolean {
    if (value === undefined || value === null || value === '') {
        return true; // Skip validation for undefined/null/empty (use validateRequired for required fields)
    }

    let dateValue: Date;
    if (value instanceof Date) {
        dateValue = value;
    } else {
        dateValue = new Date(String(value));
    }

    if (isNaN(dateValue.getTime())) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push('Must be a valid date.');
        return false;
    }

    let isValid = true;

    if (minDate && dateValue < minDate) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be after ${minDate.toISOString().split('T')[0]}.`);
        isValid = false;
    }

    if (maxDate && dateValue > maxDate) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(`Must be before ${maxDate.toISOString().split('T')[0]}.`);
        isValid = false;
    }

    return isValid;
}

/**
 * Validates a JSON object against a custom validation function.
 * @param value - The object to validate.
 * @param validateFn - Custom validation function that returns boolean.
 * @param errorMessage - Error message if validation fails.
 * @param fieldName - Name of the field being validated.
 * @param errors - Error object to update with validation errors.
 * @returns boolean indicating if validation passed.
 */
export function validateCustom(
    value: unknown,
    validateFn: (value: unknown) => boolean,
    errorMessage: string,
    fieldName: string,
    errors: ValidationErrors
): boolean {
    if (value === undefined || value === null) {
        return true; // Skip validation for undefined/null (use validateRequired for required fields)
    }

    if (!validateFn(value)) {
        errors[fieldName] = errors[fieldName] || [];
        errors[fieldName].push(errorMessage);
        return false;
    }
    return true;
}

/**
 * Creates a generic unauthorized error response (HTTP 401).
 * @param message - The error message. Defaults to 'User not authenticated'.
 * @returns A Response object formatted for unauthorized requests.
 */
export function createUnauthorizedResponse(message = 'User not authenticated'): Response {
    console.warn('Unauthorized request:', message);
    return new Response(
        JSON.stringify({ error: message }),
        {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Creates a generic forbidden error response (HTTP 403).
 * @param message - The error message. Defaults to 'Forbidden: Not authorized'.
 * @returns A Response object formatted for forbidden requests.
 */
export function createForbiddenResponse(message = 'Forbidden: Not authorized'): Response {
    console.warn('Forbidden request:', message);
    return new Response(
        JSON.stringify({ error: message }),
        {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Creates a generic not found error response (HTTP 404).
 * @param message - The error message. Defaults to 'Not Found'.
 * @returns A Response object formatted for not found requests.
 */
export function createNotFoundResponse(message = 'Not Found'): Response {
    console.warn('Not Found:', message);
    return new Response(
        JSON.stringify({ error: message }),
        {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Creates a generic method not allowed error response (HTTP 405).
 * @param message - The error message. Defaults to 'Method Not Allowed'.
 * @returns A Response object formatted for method not allowed requests.
 */
export function createMethodNotAllowedResponse(message = 'Method Not Allowed'): Response {
    console.warn('Method Not Allowed:', message);
    return new Response(
        JSON.stringify({ error: message }),
        {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}

/**
 * Creates a generic conflict error response (HTTP 409).
 * @param message - The error message. Defaults to 'Conflict'.
 * @returns A Response object formatted for conflict requests.
 */
export function createConflictResponse(message = 'Conflict'): Response {
    console.warn('Conflict:', message);
    return new Response(
        JSON.stringify({ error: message }),
        {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}


/**
 * Creates a generic internal server error response (HTTP 500).
 * @param message - The error message. Defaults to 'Internal Server Error'.
 * @param error - Optional underlying error object.
 * @returns A Response object formatted for internal server errors.
 */
export function createInternalServerErrorResponse(message = 'Internal Server Error', error?: Error): Response {
    const errorMessage = error instanceof Error ? error.message : message;
    console.error('Internal Server Error:', errorMessage, error);
    return new Response(
        JSON.stringify({ error: errorMessage }),
        {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
    );
}


/**
 * Validates a request body against a set of validation rules.
 * @param body - The request body to validate
 * @param rules - Object mapping field names to validation rule functions
 * @returns Object with errors and isValid properties
 */
export function validateRequestBody(
    body: any,
    rules: { [field: string]: ((body: any, errors: ValidationErrors) => boolean)[] }
): { errors: ValidationErrors; isValid: boolean } {
    const errors: ValidationErrors = {};
    let isValid = true;

    for (const [field, validationRules] of Object.entries(rules)) {
        for (const rule of validationRules) {
            const fieldValid = rule(body, errors);
            if (!fieldValid) {
                isValid = false;
            }
        }
    }

    return { errors, isValid };
}
