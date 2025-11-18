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
} from "@stellar/stellar-sdk";
import { useWallet } from "@/context/WalletContext";
import { signTransaction } from "@stellar/freighter-api";
import { useEvm } from "./EvmContext";

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
};

const StellarContext = createContext<StellarContextProps | undefined>(undefined);

export const StellarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const server = useMemo(
    () => new rpc.Server("https://soroban-testnet.stellar.org", { allowHttp: true }),
    []
  );

  const networkPassphrase = Networks.TESTNET;
  const wallet = useWallet();
  const { createProposalEvm } = useEvm();
  const walletAddress = wallet?.walletAddress;
  const network = wallet?.network;
  
  console.log("StellarProvider - walletAddress:", walletAddress, "network:", network);

  /**
   * fetchContractSpec
   * - uses contract.Client.from(...) to read the on-chain spec
   * - returns only the client and jsonSchema
   */
  const fetchContractSpec = async (contractId: string): Promise<FetchClientResult> => {
    const client = await contractModule.Client.from({
      contractId,
      networkPassphrase,
      rpcUrl: "https://soroban-testnet.stellar.org",
    });

    const jsonSchema = client.spec?.jsonSchema?.() ?? null;

    console.log("Fetched contract client", client);
    console.log("JSON Schema:", jsonSchema);

    return { client, jsonSchema };
  };

  /**
   * convertToScVal
   * - basic mapping from JSON-schema definitions to xdr.ScVal
   */
  const convertToScVal = (value: any, schemaDef: any): xdr.ScVal => {
    const ref = schemaDef?.["$ref"] ?? "";

    // Addresses
    if (ref.includes("Address")) {
      try {
        const scAddr = new Address(String(value)).toScAddress();
        return xdr.ScVal.scvAddress(scAddr);
      } catch (e) {
        throw new Error(`Invalid address value: ${value}`);
      }
    }

    // Integer types (U32 / I32)
    if (ref.includes("U32") || schemaDef?.type === "integer") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) throw new Error("Invalid integer");
      return xdr.ScVal.scvU32(n);
    }

    // U64, U128, U256, I64, I128, I256 as strings
    if (ref.includes("U64") || ref.includes("U128") || ref.includes("U256") ||
        ref.includes("I64") || ref.includes("I128") || ref.includes("I256")) {
      return xdr.ScVal.scvString(String(value));
    }

    // DataUrl / bytes as base64
    if (ref.includes("DataUrl")) {
      // Value should already be base64 encoded
      return xdr.ScVal.scvString(String(value));
    }

    // Default: string
    return xdr.ScVal.scvString(String(value));
  };

  /**
   * buildInvokeTx
   * - Builds transaction using contract.Client if available
   * - Returns unsigned transaction
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
        rpcUrl: "https://soroban-testnet.stellar.org",
      });
    } catch (err) {
      console.warn("Could not create contract client, falling back to manual build", err);
      client = null;
    }

    // Try using client's built-in invoke/call helpers
    if (client && typeof (client as any).invoke === "function") {
      try {
        let orderedArgs: any[] = [];
        if (schema && schema[functionName]?.properties?.args?.properties) {
          const argDefs = schema[functionName].properties.args.properties;
          orderedArgs = Object.keys(argDefs).map((k) => args[k]);
        } else {
          orderedArgs = Object.values(args);
        }

        if (typeof (client as any).invoke === "function") {
          return await (client as any).invoke(functionName, orderedArgs, { source });
        } else if (typeof (client as any).call === "function") {
          return await (client as any).call(functionName, orderedArgs, { source });
        } else if (typeof (client as any).callFunction === "function") {
          return await (client as any).callFunction(functionName, orderedArgs, { source });
        }
      } catch (err) {
        console.warn("contract.Client invocation helper failed, falling back to manual op", err);
      }
    }

    // Fallback: Manual construction using Operation.invokeContractFunction
    const methodSchema = schema?.[functionName]?.properties?.args?.properties ?? null;
    const scVals: xdr.ScVal[] = [];

    if (methodSchema) {
      for (const [argName, argDef] of Object.entries(methodSchema)) {
        if (!(argName in args)) {
          throw new Error(`Missing argument: ${argName}`);
        }
        scVals.push(convertToScVal(args[argName], argDef));
      }
    } else {
      for (const v of Object.values(args)) {
        scVals.push(xdr.ScVal.scvString(String(v)));
      }
    }

    const account = await server.getAccount(source);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: functionName,
          args: scVals,
        })
      )
      .setTimeout(30)
      .build();

    return tx;
  };

  /**
   * createProposal
   * - Builds a transaction for contract invocation
   * - Returns the transaction XDR
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
      // Build the contract invocation transaction
      const tx = await buildInvokeTx({
        contractId,
        functionName,
        args,
        source,
        schema,
      });

      // Simulate to get resource fees
      const simulated = await server.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
      }

      // Prepare transaction with footprint
      const preparedTx = rpc.assembleTransaction(tx, simulated).build();

      // Return the XDR
      const txXdr = preparedTx.toXDR();

      console.log("Transaction XDR prepared:", txXdr);

      const signedTxXDR = await signTransaction(txXdr, {
        networkPassphrase
      });

      await createProposalEvm(
        source,
        signedTxXDR.signedTxXdr,
        `${functionName}`
      );

      return {
        xdr: signedTxXDR,
        transaction: preparedTx,
      };
    } catch (error) {
      console.error("Error creating proposal:", error);
      throw error;
    }
  };

  return (
    <StellarContext.Provider value={{ 
      server, 
      networkPassphrase, 
      fetchContractSpec, 
      buildInvokeTx,
      createProposal 
    }}>
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