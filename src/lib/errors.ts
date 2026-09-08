/**
 * Error types and chain-aware translation for the multisig UI.
 *
 * Stellar surfaces failures as opaque codes - `HostError: Error(Contract, #3)`,
 * `txBAD_AUTH`, `Error(Budget, ExceededLimit)`. These helpers decode them into
 * something a signer can act on, while keeping the code itself visible (it is
 * the part worth quoting in a bug report) and the raw text one click away.
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

/**
 * The transaction was accepted by the network but the RPC had not reported a
 * final status before we stopped polling. This is NOT a failure: the submitted
 * transaction stays valid until its own timebound expires and may still be
 * included in a later ledger.
 */
export class TransactionPendingError extends Error {
    readonly hash: string;
    readonly explorerUrl?: string;
    readonly waitedMs: number;

    constructor(hash: string, waitedMs: number, explorerUrl?: string) {
        super(`Transaction ${hash} was submitted but not confirmed within ${Math.round(waitedMs / 1000)}s.`);
        this.name = "TransactionPendingError";
        this.hash = hash;
        this.waitedMs = waitedMs;
        this.explorerUrl = explorerUrl;
    }
}

/** One row in the panel's on-chain context table. */
export type ErrorMeta = {
    label: string;
    value: string;
    /** Render monospace and offer a copy button - addresses, hashes, codes. */
    mono?: boolean;
    href?: string;
};

export type FriendlyError = {
    title: string;
    message: string;
    hint?: string;
    /** Argument name to highlight in the form, when the failure is param-specific. */
    field?: string;
    /** Decoded chain error code, e.g. "Contract #3" or "txBAD_SEQ". */
    code?: string;
    /** On-chain context: network, contract, function, hash. */
    meta?: ErrorMeta[];
    /** Raw error text, shown behind a "Technical details" disclosure. */
    detail?: string;
    /** Optional outbound link, e.g. the transaction on a block explorer. */
    link?: { href: string; label: string };
    /** Rendered as a warning rather than an error - the operation may still succeed. */
    severity?: "error" | "warning";
};

/** Where a host error came from. */
const HOST_ERROR_TYPES: Record<string, string> = {
    Contract: "the contract's own logic",
    WasmVm: "the contract's WASM virtual machine",
    Context: "the invocation context",
    Storage: "ledger storage",
    Object: "host object handling",
    Crypto: "a cryptographic operation",
    Events: "event emission",
    Budget: "the resource budget",
    Value: "value conversion",
    Auth: "authorization",
};

/** What the host error code means. */
const HOST_ERROR_CODES: Record<string, string> = {
    InternalError: "The host hit an internal error.",
    UnexpectedType: "A value had a different type than the contract expected.",
    ArithDomain: "An arithmetic operation overflowed or divided by zero.",
    IndexBounds: "An index was out of range.",
    InvalidInput: "An input value was rejected as malformed.",
    MissingValue: "A required ledger entry or value does not exist.",
    ExistingValue: "A value that must not already exist was already there.",
    ExceededLimit: "The call exceeded a resource or size limit.",
    InvalidAction: "The operation is not permitted in this context.",
    UnexpectedSize: "A value had an unexpected size.",
};

/** Classic (non-Soroban) transaction result codes. */
const TX_RESULT_CODES: Record<string, string> = {
    txBAD_AUTH: "Not enough valid signatures to meet the account's threshold.",
    txBAD_AUTH_EXTRA: "The transaction carried a signature that no signer needed.",
    txBAD_SEQ: "The sequence number is stale - the account has moved on since this was built.",
    txTOO_LATE: "The transaction's time bound expired before it was included.",
    txTOO_EARLY: "The transaction's time bound has not started yet.",
    txINSUFFICIENT_FEE: "The fee is below what the network is currently accepting.",
    txINSUFFICIENT_BALANCE: "The source account cannot cover the fee and reserves.",
    txNO_ACCOUNT: "The source account does not exist on this network.",
    txFAILED: "One of the operations in the transaction failed.",
};

/**
 * Pull a chain error code out of a raw message and explain it.
 * Returns null when the message carries no recognisable code.
 */
export function parseChainError(message: string): { code: string; explanation: string } | null {
    // HostError shape: Error(Contract, #3) / Error(Budget, ExceededLimit)
    const host = message.match(/Error\(([A-Za-z]+),\s*#?([A-Za-z0-9]+)\)/);
    if (host) {
        const [, type, code] = host;
        const source = HOST_ERROR_TYPES[type] ?? type;

        // A numeric code is contract-defined; only the contract knows its meaning.
        if (/^\d+$/.test(code)) {
            return {
                code: `${type} #${code}`,
                explanation: `Rejected by ${source} with error code ${code}. The meaning of that code is defined by the contract - check its source or docs for error ${code}.`,
            };
        }

        return {
            code: `${type}: ${code}`,
            explanation: HOST_ERROR_CODES[code]
                ? `${HOST_ERROR_CODES[code]} Raised by ${source}.`
                : `Rejected by ${source} (${code}).`,
        };
    }

    const txCode = message.match(/\b(tx[A-Z_]{3,})\b/);
    if (txCode && TX_RESULT_CODES[txCode[1]]) {
        return { code: txCode[1], explanation: TX_RESULT_CODES[txCode[1]] };
    }

    const opCode = message.match(/\b(op[A-Z_]{3,})\b/);
    if (opCode) {
        return { code: opCode[1], explanation: "An operation inside the transaction was rejected." };
    }

    return null;
}

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

/** On-chain context the caller knows and the error text does not carry. */
export type ErrorContext = {
    network?: string;
    contractId?: string;
    functionName?: string;
    account?: string;
    hash?: string;
    explorerBase?: string;
};

function buildMeta(context: ErrorContext = {}): ErrorMeta[] {
    const rows: ErrorMeta[] = [];
    const { network, contractId, functionName, account, hash, explorerBase } = context;

    if (network) rows.push({ label: "Network", value: network });
    if (functionName) rows.push({ label: "Function", value: functionName, mono: true });
    if (contractId) {
        rows.push({
            label: "Contract",
            value: contractId,
            mono: true,
            href: explorerBase ? `${explorerBase}/contract/${contractId}` : undefined,
        });
    }
    if (account) rows.push({ label: "Source", value: account, mono: true });
    if (hash) {
        rows.push({
            label: "Tx hash",
            value: hash,
            mono: true,
            href: explorerBase ? `${explorerBase}/tx/${hash}` : undefined,
        });
    }

    return rows;
}

/**
 * Map any thrown value onto the shape the UI renders.
 * Ordered most-specific first; the final fallback never loses the raw text.
 */
export function describeError(error: unknown, context: ErrorContext = {}): FriendlyError {
    const detail = rawText(error);
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    const meta = buildMeta(context);

    if (error instanceof TransactionPendingError) {
        return {
            title: "Awaiting confirmation",
            message:
                "The network accepted this transaction but the RPC has not reported a final status yet. It has not failed - it may still be included in a later ledger.",
            hint: 'Nothing needs re-signing. Use "Check status" to refresh, or follow the hash on the explorer.',
            severity: "warning",
            meta: buildMeta({ ...context, hash: error.hash }),
            link: error.explorerUrl ? { href: error.explorerUrl, label: "View on explorer" } : undefined,
            detail,
        };
    }

    if (error instanceof ContractParamError) {
        return {
            title: "Invalid argument",
            message: error.message,
            hint: error.hint,
            field: error.field,
            meta,
            detail,
        };
    }

    // Wallet cancellation - not a failure worth alarming the user about.
    if (/signing aborted|user (declined|rejected|cancell?ed)|request rejected/i.test(message)) {
        return {
            title: "Signature declined",
            message: "The wallet did not return a signature, so nothing was submitted.",
            hint: "Re-open your wallet and approve the request to continue.",
            severity: "warning",
            meta,
            detail,
        };
    }

    if (/TRY_AGAIN_LATER/i.test(message)) {
        return {
            title: "RPC congested",
            message: "The Soroban RPC could not accept the transaction right now and asked us to retry.",
            hint: "Nothing was executed and no fee was charged. Wait a few seconds and try again.",
            code: "TRY_AGAIN_LATER",
            severity: "warning",
            meta,
            detail,
        };
    }

    // Simulation and execution failures both carry chain error codes.
    const chain = parseChainError(message);

    if (/simulation failed/i.test(message)) {
        return {
            title: "Rejected in simulation",
            message:
                chain?.explanation ??
                message.replace(/^simulation failed:\s*/i, "").trim() ??
                "The contract rejected this call.",
            hint: "The call was tested against current ledger state and failed, so nothing was submitted and no fee was charged.",
            code: chain?.code,
            meta,
            detail,
        };
    }

    if (/transaction failed|HostError/i.test(message)) {
        return {
            title: "Transaction failed on-chain",
            message: chain?.explanation ?? "The transaction was included in a ledger but the call failed.",
            hint: "State was rolled back, but the fee was charged. Fix the cause and create a new proposal.",
            code: chain?.code,
            meta,
            detail,
        };
    }

    if (chain) {
        return { title: "Rejected by the network", message: chain.explanation, code: chain.code, meta, detail };
    }

    if (/account not found|not found.*account/i.test(message)) {
        return {
            title: "Account not found",
            message: "The source account does not exist on this network.",
            hint: "Check that the multisig address is funded and that you are pointed at the right network.",
            meta,
            detail,
        };
    }

    if (/fetch|network|ECONN|timeout|timed out|502|503|504/i.test(message)) {
        return {
            title: "RPC unreachable",
            message: "Could not reach the Soroban RPC endpoint.",
            hint: "Check your connection and VITE_SOROBAN_URL, then try again.",
            severity: "warning",
            meta,
            detail,
        };
    }

    if (/no such contract|contract.*not found|invalid contract/i.test(message)) {
        return {
            title: "Contract not found",
            message: "No contract is deployed at that address on this network.",
            hint: "Confirm the contract ID and that you are on the intended network.",
            meta,
            detail,
        };
    }

    return {
        title: "Something went wrong",
        message: message || "An unexpected error occurred.",
        meta,
        detail,
    };
}
