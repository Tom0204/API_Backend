/** Enveloppes de `docs/conventions.md` §3 et §4. */

export interface SuccessBody<T> {
    success: true
    message: string
    data: T
}

export interface ErrorDetail {
    field: string
    message: string
}

export interface ErrorBody {
    success: false
    message: string
    error: { code: string; details: ErrorDetail[] }
}

export function success<T>(message: string, data: T): SuccessBody<T> {
    return { success: true, message, data }
}

export function failure(message: string, code: string, details: ErrorDetail[] = []): ErrorBody {
    return { success: false, message, error: { code, details } }
}
