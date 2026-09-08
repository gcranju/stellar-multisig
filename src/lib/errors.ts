/**
 * Error types and human-readable translation for contract-call proposals.
 *
 * The Stellar SDK and RPC surface raw, developer-facing strings ("invalid type
 * (bool) specified for string value", "HostError: Error(Contract, #3)"). These
 * helpers turn them into something a signer can act on, while keeping the raw
 * text available for debugging.
 */

/** A parameter the user supplied could not be converted to an ScVal. */
export class ContractParamError extends Error {
    /** Name of the offending argument, so the form can highlight that input. */
    readonly field?: string;
    /** Short, actionable follow-up shown under the message. */
    readonly hint?: string;

    constructor(message: string, options: { field?: string; hint?: string; cause?: unknown } = {}) {
        super(message);
        this.name = "ContractParamError";
        this.field = options.field;
        this.hint = options.hint;
        if (options.cause !== undefined) {
            (this as { cause?: unknown }).cause = options.cause;
        }
    }
}

export type FriendlyError = {
    title: string;
    message: string;
    hint?: string;
    /** Argument name to highlight in the form, when the failure is param-specific. */
    field?: string;
    /** Raw error text, shown behind a "Technical details" disclosure. */
    detail?: string;
};

function rawText(error: unknown): string | undefined {
    if (error instanceof Error) {
        const cause = (error as { cause?: unknown }).cause;
        const causeText = cause instanceof Error ? `\n\nCaused by: ${cause.message}` : "";
        return `${error.stack || error.message}${causeText}`;
    }
    if (typeof error === "string") return error;
    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error);
    }
}

/**
 * Map any thrown value onto the shape the UI renders.
 * Ordered most-specific first; the final fallback never loses the raw text.
 */
export function describeError(error: unknown): FriendlyError {
    const detail = rawText(error);
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");

    if (error instanceof ContractParamError) {
        return {
            title: "Invalid argument",
            message: error.message,
            hint: error.hint,
            field: error.field,
            detail,
        };
    }

    // Wallet cancellation - not a failure worth alarming the user about.
    if (/signing aborted|user (declined|rejected|cancell?ed)|request rejected/i.test(message)) {
        return {
            title: "Signature declined",
            message: "The wallet did not return a signature, so nothing was submitted.",
            hint: "Re-open your wallet and approve the request to continue.",
            detail,
        };
    }

    if (/simulation failed/i.test(message)) {
        return {
            title: "Simulation failed",
            message: message.replace(/^simulation failed:\s*/i, "").trim() || "The network rejected this call.",
            hint: "The contract refused the call before it was submitted - usually wrong arguments, a missing authorization, or a failing contract-side assertion.",
            detail,
        };
    }

    if (/account not found|not found.*account/i.test(message)) {
        return {
            title: "Account not found",
            message: "The source account does not exist on this network.",
            hint: "Check that the multisig address is funded and that you are pointed at the right network.",
            detail,
        };
    }

    if (/fetch|network|ECONN|timeout|timed out|502|503|504/i.test(message)) {
        return {
            title: "Network unreachable",
            message: "Could not reach the Soroban RPC endpoint.",
            hint: "Check your connection and VITE_SOROBAN_URL, then try again.",
            detail,
        };
    }

    if (/no such contract|contract.*not found|invalid contract/i.test(message)) {
        return {
            title: "Contract not found",
            message: "No contract is deployed at that address on this network.",
            hint: "Confirm the contract ID and that you are on the intended network.",
            detail,
        };
    }

    return {
        title: "Something went wrong",
        message: message || "An unexpected error occurred.",
        detail,
    };
}
