// Keep the status available so callers can distinguish a 401 from other failures.
export class ApiError extends Error {
    readonly status: number

    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}
