import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x5f557aC4653E6dFc4616631683551aE4E0c073d3";
import abi from "@/abi/StellarMultisigRegistry.json";

interface Proposal {
  proposalId: bigint;
  xdr: string;
  description: string;
  executed: boolean;
  executedTxHash: string;
  createdAt: bigint;
  isDeleted: boolean;
}

interface EvmContextType {
  walletAddress: string | null;
  contract: ethers.Contract | null;
  createMultisig: (
    stellarAddress: string,
    name: string,
    signers: string[],
    threshold: number
  ) => Promise<void>;
  createProposalEvm: (
    stellarAddress: string,
    xdr: string,
    description: string
  ) => Promise<number>;
  getMultisig: (stellarAddress: string) => Promise<{
    name: string;
    threshold: number;
    signers: string[];
  } | null>;
  getProposals: (stellarAddress: string) => Promise<Proposal[]>;
  getProposal: (stellarAddress: string, proposalId: number) => Promise<Proposal | null>;
}

const EvmContext = createContext<EvmContextType | undefined>(undefined);

export const EvmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    const init = async () => {
      const privateKey = import.meta.env.VITE_EVM_PRIVATE_KEY as string;
      const rpcURL = import.meta.env.VITE_EVM_RPC_URL as string;

      if (!privateKey || !rpcURL) {
        console.error("Missing private key or RPC URL in .env");
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(rpcURL);
        const wallet = new ethers.Wallet(privateKey, provider);
        setWalletAddress(wallet.address);

        const contractInstance = new ethers.Contract(
          CONTRACT_ADDRESS,
          abi,
          wallet
        );
        setContract(contractInstance);
      } catch (error) {
        console.error("Error initializing contract:", error);
      }
    };

    init();
  }, []);

  const createMultisig = async (
    stellarAddress: string,
    name: string,
    signers: string[],
    threshold: number
  ) => {
    if (!contract) return;
    try {
      const tx = await contract.createMultisig(
        stellarAddress,
        name,
        signers,
        threshold
      );
      await tx.wait();
      console.log("Multisig created!");
    } catch (error) {
      console.error("Error creating multisig:", error);
    }
  };

  const createProposalEvm = async (
    stellarAddress: string,
    xdr: string,
    description: string
  ): Promise<number> => {
    if (!contract) return 0;
    try {
      const tx = await contract.createProposal(stellarAddress, xdr, description);
      const receipt = await tx.wait();
      const event = receipt.logs?.find((e: any) => e.eventName === "ProposalCreated");
      const proposalId = event?.args?.proposalId ?? 0;
      return proposalId;
    } catch (error) {
      console.error("Error creating proposal:", error);
      return 0;
    }
  };

  const getMultisig = async (stellarAddress: string) => {
    if (!contract) return null;
    try {
      const multisig = await contract.getMultisig(stellarAddress);
      console.log("Fetched multisig from contract:", multisig.signers);
      return {
        name: multisig.name,
        threshold: Number(multisig.threshold),
        signers: multisig.signers,
      };
    } catch (error) {
      console.error("Error fetching multisig:", error);
      return null;
    }
  };

  const getProposals = async (stellarAddress: string): Promise<Proposal[]> => {
    if (!contract) return [];
    try {
      // Get all proposal IDs for this multisig
      console.log("Fetching proposal IDs for:", stellarAddress);
      const proposalList = await contract.getAllProposals(stellarAddress);
      const proposals: Proposal[] = [];

      for (const proposalData of proposalList) {
        if (!proposalData.isDeleted) {
          proposals.push({
            proposalId: BigInt(proposalData.proposalId),
            xdr: proposalData.xdr,
            description: proposalData.description,
            executed: proposalData.executed,
            executedTxHash: proposalData.executedTxHash,
            createdAt: BigInt(proposalData.createdAt),
            isDeleted: proposalData.isDeleted,
          });
        }
      }
      console.log("Fetched proposal IDs:", proposals);
      return proposals;
    } catch (error) {
      console.error("Error fetching proposals:", error);
      return [];
    }
  };

  const getProposal = async (
    stellarAddress: string,
    proposalId: number
  ): Promise<Proposal | null> => {
    if (!contract) return null;
    try {
      const proposalData = await contract.proposals(stellarAddress, proposalId);
      
      if (proposalData.isDeleted) {
        return null;
      }

      return {
        proposalId: BigInt(proposalData.proposalId),
        xdr: proposalData.xdr,
        description: proposalData.description,
        executed: proposalData.executed,
        executedTxHash: proposalData.executedTxHash,
        createdAt: BigInt(proposalData.createdAt),
        isDeleted: proposalData.isDeleted,
      };
    } catch (error) {
      console.error("Error fetching proposal:", error);
      return null;
    }
  };

  return (
    <EvmContext.Provider
      value={{
        walletAddress,
        contract,
        createMultisig,
        createProposalEvm,
        getMultisig,
        getProposals,
        getProposal,
      }}
    >
      {children}
    </EvmContext.Provider>
  );
};

export const useEvm = () => {
  const context = useContext(EvmContext);
  if (!context) {
    throw new Error("useEvm must be used within an EvmProvider");
  }
  return context;
};