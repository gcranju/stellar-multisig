// StellarContext.tsx
import React, { createContext, useContext, useMemo } from "react";
import {
    rpc,
    Networks,
    TransactionBuilder,
    BASE_FEE,
    xdr,
    Address,
    Operation,
    contract as contractModule,
    Contract,
    nativeToScVal,
} from "@stellar/stellar-sdk";
import { useWallet } from "@/context/WalletContext";
import { signTransaction } from "@stellar/freighter-api";
import { useEvm } from "./EvmContext";
import { Buffer } from "buffer";
import { Horizon } from "stellar-sdk";

type FetchClientResult = {
    client: InstanceType<typeof contractModule.Client>;
    jsonSchema?: any;
};

type CreateProposalParams = {
    contractId: string;
    functionName: string;
    args: Record<string, any>;
    schema?: any;
    source: string;
};

type StellarContextProps = {
    server: rpc.Server;
    networkPassphrase: string;
    fetchContractSpec: (contractId: string) => Promise<FetchClientResult>;
    buildInvokeTx: (options: {
        contractId: string;
        functionName: string;
        args: Record<string, any>;
        source: string;
        schema?: any;
    }) => Promise<any>;
    createProposal: (params: CreateProposalParams) => Promise<any>;
    createProposalToUpdateSigners: (params: {
        source: string;
        oldSigners: string[];
        newSigners: string[];
        threshold: number;
    }) => Promise<any>;
    createProposalToUpdateThreshold: (params: {
        source: string;
        threshold: number;

    }) => Promise<any>;
    signProposal: (options: {
        multisigAddress: string;
        proposalId: number;
        signer: string;
        xdr: string;
    }) => Promise<string>;
    signAndExecuteProposal: (options: {
        multisigAddress: string;
        proposalId: number;
        signer: string;
        xdr: string;
        sign?: boolean;
    }) => Promise<void>;
    fetchSignersAndThresholds: (accountId: string) => Promise<{
        signers: string[];
        threshold: number
    }>;
};

const StellarContext = createContext<StellarContextProps | undefined>(undefined);

export const StellarProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const server = useMemo(
        () => new rpc.Server(import.meta.env.VITE_SOROBAN_URL, { allowHttp: true }),
        []
    );

    const horizonServer = useMemo(
        () => new Horizon.Server(import.meta.env.VITE_HORIZON_URL),
        []
    );

    const wallet = useWallet();
    const { createProposalEvm, signProposalEvm, markProposalExecuted } = useEvm();
    const walletAddress = wallet?.walletAddress;
    const network = wallet?.network;
    const networkPassphrase = wallet?.networkPassphrase ?? Networks.PUBLIC;

    /**
     * fetchContractSpec
     */
    const fetchContractSpec = async (contractId: string): Promise<FetchClientResult> => {
        const client = await contractModule.Client.from({
            contractId,
            networkPassphrase,
            rpcUrl: import.meta.env.VITE_SOROBAN_URL,
        });

        const jsonSchema = client.spec?.jsonSchema?.() ?? null;

        return { client, jsonSchema };
    };

    async function fetchSignersAndThresholds(accountId: string) {
        try {
            const account = await horizonServer.loadAccount(accountId);

            // Get signers
            const signers = account.signers.map((s) => s.key).filter(
                (key) => key !== accountId // Exclude master key if present
            );

            const threshold = account.thresholds.high_threshold;

            return { signers, threshold };
        } catch (error) {
            console.error("Error fetching account details:", error);
            throw error;
        }
    }

    /**
     * convertToScVal
     */
    function convertToScVal(value: any, typeDef: any) {
        if (typeDef?.$ref) {
            const refType = typeDef.$ref.split("/").pop();

            switch (refType) {
                case "Address":
                    return nativeToScVal(value, { type: "address" });

                case "U128":
                case "u128":
                    return nativeToScVal(value, { type: "u128" });

                case "U64":
                case "u64":
                    return nativeToScVal(value, { type: "u64" });

                case "U32":
                case "u32":
                    return nativeToScVal(value, { type: "u32" });

                case "I128":
                case "i128":
                    return nativeToScVal(value, { type: "i128" });

                case "I64":
                case "i64":
                    return nativeToScVal(value, { type: "i64" });

                case "I32":
                case "i32":
                    return nativeToScVal(value, { type: "i32" });

                case "DataUrl":
                case "Bytes":
                case "bytes":
                    // Expect hex string - convert to Buffer
                    const bytes = Buffer.from(value, "hex");
                    return nativeToScVal(bytes, { type: "bytes" });

                case "String":
                case "string":
                    return nativeToScVal(value, { type: "string" });

                case "Bool":
                case "bool":
                case "boolean":
                    return nativeToScVal(value, { type: "bool" });

                default:
                    return nativeToScVal(value);
            }
        }

        return nativeToScVal(value);
    }

    /**
     * Build parameters array from args and schema
     */
    function buildParams(args: Record<string, any>, methodSchema: any) {
        const params: any[] = [];

        for (const [paramName, typeDef] of Object.entries(methodSchema || {})) {
            const value = args[paramName];

            if (value === undefined || value === null) {
                throw new Error(`Missing required parameter: ${paramName}`);
            }

            const scVal = convertToScVal(value, typeDef);
            params.push(scVal);
        }

        return params;
    }

    /**
     * buildInvokeTx
     */
    const buildInvokeTx = async ({
        contractId,
        functionName,
        args,
        source,
        schema,
    }: {
        contractId: string;
        functionName: string;
        args: Record<string, any>;
        source: string;
        schema?: any;
    }) => {
        let client: InstanceType<typeof contractModule.Client> | null = null;
        try {
            client = await contractModule.Client.from({
                contractId,
                networkPassphrase,
                rpcUrl: import.meta.env.VITE_SOROBAN_URL,
            });
        } catch (err) {
            console.warn("Could not create contract client, falling back to manual build", err);
            client = null;
        }

        const methodSchema = schema?.definitions?.[functionName]?.properties?.args?.properties ?? null;

        const contract = new Contract(contractId);
        const params = buildParams(args, methodSchema);

        const operation = contract.call(functionName, ...params);

        const now = Math.floor(Date.now() / 1000);
        const twoDays = 2 * 24 * 60 * 60;
        const maxTime = now + twoDays;

        const account = await server.getAccount(source);

        const tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase,
            })
            .addOperation(operation)
            .setTimeout(twoDays)
            .build();

        return tx;
    };

    /**
     * Helper: safeSignTransaction
     * - Wraps signTransaction so we can detect wallet cancellation/errors
     * - Returns the signedTxXdr string on success
     * - Throws on failure (so caller will not commit to EVM)
     */
    const safeSignTransaction = async (txXdr: string): Promise<string> => {
        try {
            const signed = await signTransaction(txXdr, { networkPassphrase });
            if (!signed || !signed.signedTxXdr) {
                throw new Error("Wallet returned no signed XDR");
            }
            return signed.signedTxXdr;
        } catch (err) {
            // Best effort: log and rethrow a friendly error so callers can abort gracefully
            console.warn("Signing failed or was cancelled by user/wallet:", err);
            throw new Error("Signing aborted or failed");
        }
    };

    const simulateTransaction = async (signedTxXdr: string) => {
        const txObj = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
        const simulated = await server.simulateTransaction(txObj);
        if (rpc.Api.isSimulationError(simulated)) {
            const err = simulated.error ?? JSON.stringify(simulated);
            throw new Error(`Simulation failed: ${err}`);
        }
        return { success: true, result: simulated };
    }

    /**
     * Helper: submitAndCheckTransaction
     * - If checkOnly === true -> simulate the signed tx to validate it (no submit)
     * - If checkOnly === false -> submit to network and ensure success
     * - Throws on failure
     */
    const submitAndCheckTransaction = async (signedTxXdr: string, timeout = 15000, checkInterval = 1500) => {
        const txObj = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);

        const result = await server.sendTransaction(txObj);

        if (!result) {
            throw new Error(`Stellar submission failed: ${JSON.stringify(result)}`);
        }

        // If status is PENDING, we poll for a final status
        if (result.status === "PENDING") {
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                await new Promise((res) => setTimeout(res, checkInterval));

                try {
                    const statusResponse = await server.getTransaction(result.hash);
                    if (statusResponse.status === "SUCCESS") {
                        return { success: true, result: statusResponse };
                    } else if (statusResponse.status === "FAILED") {
                        throw new Error(`Stellar transaction failed: ${JSON.stringify(statusResponse)}`);
                    }
                } catch (err) {
                    console.warn("Error querying tx status, retrying", err);
                }
            }

            throw new Error(`Transaction did not complete within ${timeout}ms`);
        }
    };


    /**
     * signProposal
     * - Sign an XDR via Freighter (or throw)
     * - Only after signing succeeded save to EVM via signProposalEvm
     */
    const signProposal = async ({
        multisigAddress,
        proposalId,
        signer,
        xdr,
    }: {
        multisigAddress: string;
        proposalId: number;
        signer: string;
        xdr: string;
    }): Promise<string> => {
        if (!walletAddress) {
            throw new Error("Wallet not connected");
        }

        try {
            const signedXdr = await safeSignTransaction(xdr);

            // Only after successful signing do we save this signature in EVM layer
            await signProposalEvm(multisigAddress, proposalId, signer, signedXdr);

            return signedXdr;
        } catch (error) {
            console.error("Error signing proposal:", error);
            throw error;
        }
    };

    /**
     * signAndExecuteProposal
     * - Optionally sign first (via Freighter) and then submit to Stellar network
     * - Only mark as executed in EVM if submission succeeds
     */
    const signAndExecuteProposal = async ({
        multisigAddress,
        proposalId,
        signer,
        xdr,
        sign = true,
    }: {
        multisigAddress: string;
        proposalId: number;
        signer: string;
        xdr: string;
        sign?: boolean;
    }) => {
        if (!walletAddress) {
            throw new Error("Wallet not connected");
        }

        let signedTxXdr = xdr;
        try {
            if (sign) {
                signedTxXdr = await signProposal({ multisigAddress, proposalId, signer, xdr });
            }

            const { success, result } = await submitAndCheckTransaction(signedTxXdr);

            if (success && result && result.txHash) {
                await markProposalExecuted(multisigAddress, proposalId, result.txHash);
            }
        } catch (error) {
            console.error("Error executing proposal:", error);
            throw error;
        }
    };

    /**
     * createProposal
     * - Builds a transaction for contract invocation, simulates, prepares footprint,
     * - Requests signature via Freighter (safeSignTransaction),
     * - Validates signed transaction via simulation, THEN commits to EVM
     */
    const createProposal = async ({
        contractId,
        functionName,
        args,
        schema,
        source,
    }: CreateProposalParams) => {
        if (!walletAddress) {
            throw new Error("Wallet not connected");
        }

        try {
            const tx = await buildInvokeTx({
                contractId,
                functionName,
                args,
                source,
                schema,
            });

            const simulated = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationError(simulated)) {
                throw new Error(`Simulation failed: ${simulated.error}`);
            }

            const preparedTx = rpc.assembleTransaction(tx, simulated).build();
            const txXdr = preparedTx.toXDR();

            let signedXdr: string;
            try {
                signedXdr = await safeSignTransaction(txXdr);
            } catch (signErr) {
                throw signErr;
            }

            // Validate signed transaction via simulation (lightweight check) BEFORE committing to EVM
            await simulateTransaction(signedXdr);

            // Save proposal to EVM only after sign + validation succeeded
            await createProposalEvm(source, signedXdr, `${functionName}`, walletAddress);

            return {
                xdr: signedXdr,
                transaction: preparedTx,
            };
        } catch (error) {
            console.error("Error creating proposal:", error);
            throw error;
        }
    };

    /**
     * createProposalToUpdateSigners
     * - Builds setOptions operations to remove old signers (weight 0) and add new signers (weight 1)
     * - Skips signers which are common to both lists
     * - Safe sign, validate signed tx via simulate, then commit to EVM
     */
    const createProposalToUpdateSigners = async ({
        source,
        oldSigners,
        newSigners,
        threshold,
    }: {
        source: string;
        oldSigners: string[];
        newSigners: string[];
        threshold: number;
    }) => {
        if (!walletAddress) {
            throw new Error("Wallet not connected");
        }

        try {
            const account = await server.getAccount(source);

            const now = Math.floor(Date.now() / 1000);
            const twoDays = 2 * 24 * 60 * 60;
            const maxTime = now + twoDays;

            const txBuilder = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase,
                timebounds: { minTime: 0, maxTime },
            });

            // Remove old signers not in new list
            oldSigners.forEach((signer) => {
                if (!newSigners.includes(signer)) {
                    txBuilder.addOperation(
                        Operation.setOptions({
                            signer: { ed25519PublicKey: signer, weight: 0 },
                        })
                    );
                }
            });

            // Add new signers not already in old list (weight fixed to 1)
            newSigners.forEach((pubKey) => {
                if (!oldSigners.includes(pubKey)) {
                    txBuilder.addOperation(
                        Operation.setOptions({
                            signer: { ed25519PublicKey: pubKey, weight: 1 },
                        })
                    );
                }
            });


            if (threshold > 0) {
                txBuilder.addOperation(
                    Operation.setOptions({
                        lowThreshold: threshold,
                        medThreshold: threshold,
                        highThreshold: threshold,
                    })
                );
            }

            const tx = txBuilder.build();
            const txXdr = tx.toXDR();

            const signedXdr = await safeSignTransaction(txXdr);

            await createProposalEvm(source, signedXdr, "update_signers", walletAddress);

            return {
                xdr: signedXdr,
                transaction: tx,
            };
        } catch (error) {
            console.error("Error creating signer update proposal:", error);
            throw error;
        }
    };

    /**
     * createProposalToUpdateThreshold
     * - Sets low, med, high thresholds to the same value (masterWeight left 0)
     * - Safe sign + simulate-validate before committing to EVM
     */
    const createProposalToUpdateThreshold = async ({
        source,
        threshold,
    }: {
        source: string;
        threshold: number;
    }) => {
        if (!walletAddress) {
            throw new Error("Wallet not connected");
        }

        try {
            const account = await server.getAccount(source);

            const now = Math.floor(Date.now() / 1000);
            const twoDays = 2 * 24 * 60 * 60;
            const maxTime = now + twoDays;

            const txBuilder = new TransactionBuilder(account, {
                fee: BASE_FEE,
                networkPassphrase,
                timebounds: { minTime: 0, maxTime },
            });

            txBuilder.addOperation(
                Operation.setOptions({
                    lowThreshold: threshold,
                    medThreshold: threshold,
                    highThreshold: threshold,
                    masterWeight: 0, // ensure master remains disabled / zero
                })
            );

            const tx = txBuilder.build();

            // Simulate to prepare footprint
            const simulated = await server.simulateTransaction(tx);
            if (rpc.Api.isSimulationError(simulated)) {
                throw new Error(`Simulation failed: ${simulated.error}`);
            }

            const preparedTx = rpc.assembleTransaction(tx, simulated).build();
            const txXdr = preparedTx.toXDR();

            const signedXdr = await safeSignTransaction(txXdr);

            await simulateTransaction(signedXdr);

            await createProposalEvm(source, signedXdr, `update_threshold_${threshold}`, walletAddress);

            return {
                xdr: signedXdr,
                transaction: preparedTx,
            };
        } catch (error) {
            console.error("Error creating threshold update proposal:", error);
            throw error;
        }
    };

    return (
        <StellarContext.Provider
            value={{
                server,
                networkPassphrase,
                fetchContractSpec,
                buildInvokeTx,
                createProposal,
                createProposalToUpdateSigners,
                createProposalToUpdateThreshold,
                signProposal,
                signAndExecuteProposal,
                fetchSignersAndThresholds,
            }}
        >
            {children}
        </StellarContext.Provider>
    );
};

export const useStellar = () => {
    const context = useContext(StellarContext);
    if (!context) {
        throw new Error("useStellar must be used within a StellarProvider");
    }
    return context;
};
