import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = import.meta.env.VITE_EVM_STORAGE_ADDRESS as string;
import abi from "@/abi/StellarMultisigRegistry.json";

type ProposalSignersResponse = {
  allSigners: string[];
  signedSigners: string[];
};
interface Proposal {
  proposalId: bigint;
  xdr: string;
  description: string;
  executed: boolean;
  executedTxHash: string;
  createdAt: bigint;
  isDeleted: boolean;
  signers?: ProposalSignersResponse;
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
    description: string,
    signer: string
  ) => Promise<number>;
  signProposalEvm: (
    stellarAddress: string,
    proposalId: number,
    signer: string,
    xdr: string
  ) => Promise<void>;
  markProposalExecuted: (
    stellarAddress: string,
    proposalId: number,
    executedTxHash: string
  ) => Promise<void>;
  getMultisig: (stellarAddress: string) => Promise<{
    name: string;
    threshold: number;
    signers: string[];
  } | null>;
  deleteProposal: (
    stellarAddress: string,
    proposalId: number
  ) => Promise<void>;
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
      const configuredRpc = import.meta.env.VITE_EVM_RPC_URL as string;

      if (!privateKey || !configuredRpc) {
        console.error("Missing private key or RPC URL in .env");
        return;
      }

      const rpcURL = configuredRpc.startsWith("/")
        ? `${window.location.origin}${configuredRpc}`
        : configuredRpc;

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
    } catch (error) {
      console.error("Error creating multisig:", error);
    }
  };

  const createProposalEvm = async (
    stellarAddress: string,
    xdr: string,
    description: string,
    signer: string
  ): Promise<number> => {
    if (!contract) return 0;
    try {
      const tx = await contract.createProposal(stellarAddress, xdr, description, signer);
      const receipt = await tx.wait();
      const event = receipt.logs?.find((e: any) => e.eventName === "ProposalCreated");
      const proposalId = event?.args?.proposalId ?? 0;
      return proposalId;
    } catch (error) {
      console.error("Error creating proposal:", error);
      return 0;
    }
  };

  const signProposalEvm = async (
    stellarAddress: string,
    proposalId: number,
    signer: string,
    xdr: string
  ) => {
    if (!contract) return;
    try {
      const tx = await contract.signProposal(stellarAddress, proposalId, xdr, signer);
      await tx.wait();
    } catch (error) {
      console.error("Error signing proposal:", error);
    }
  };

  const markProposalExecuted = async (
    stellarAddress: string,
    proposalId: number,
    executedTxHash: string
  ) => {
    if (!contract) return;
    try {
      const tx = await contract.markProposalExecuted(stellarAddress, proposalId, executedTxHash);
      await tx.wait();
    } catch (error) {
      console.error("Error marking proposal as executed:", error);
    }
  };

  const deleteProposal = async (
    stellarAddress: string,
    proposalId: number
  ) => {
    if (!contract) return;
    try {
      const tx = await contract.deleteProposal(stellarAddress, proposalId);
      await tx.wait();
    } catch (error) {
      console.error("Error deleting proposal:", error);
    }
  }

  const getMultisig = async (stellarAddress: string) => {
    if (!contract) return null;
    try { 
      const multisig = await contract.getMultisig(stellarAddress);
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
      return proposals;
    } catch (error) {
      console.error("Error fetching proposals:", error);
      return [];
    }
  };

const getProposalSigners = async (
  stellarAddress: string,
  proposalId: number
): Promise<ProposalSignersResponse> => {
  if (!contract) return { allSigners: [], signedSigners: [] };

  try {
    const [allSigners, signedSigners] = await contract.getProposalSigners(stellarAddress, proposalId);
    return { allSigners, signedSigners };
  } catch (error) {
    console.error("Error fetching proposal signers:", error);
    return { allSigners: [], signedSigners: [] };
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
        signers: await getProposalSigners(stellarAddress, proposalId),
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
        signProposalEvm,
        markProposalExecuted,
        deleteProposal
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