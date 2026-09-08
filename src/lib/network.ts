import { Networks } from "@stellar/stellar-sdk";

/** Shared network naming + explorer links, so errors and links agree everywhere. */
export const isPublicNetwork = (passphrase?: string) => passphrase === Networks.PUBLIC;

export const networkLabel = (passphrase?: string) =>
    isPublicNetwork(passphrase) ? "Mainnet (public)" : "Testnet";

export const explorerBase = (passphrase?: string) =>
    `https://stellar.expert/explorer/${isPublicNetwork(passphrase) ? "public" : "testnet"}`;

/** Context rows every chain error should carry. */
export const chainContext = (passphrase?: string) => ({
    network: networkLabel(passphrase),
    explorerBase: explorerBase(passphrase),
});
