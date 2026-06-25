# stellar-sign

A multisig web app for the Stellar network — create multisig accounts, propose transactions, and collect signatures through the Freighter wallet.

## Features

- Connect and sign with the [Freighter](https://www.freighter.app/) browser wallet.
- Create new multisig setups on Stellar.
- Propose transactions and gather the required signatures before submission.
- Track proposals from creation through signing to execution.
- Backed by an on-chain multisig registry (`StellarMultisigRegistry`).

## Pages

- **Dashboard** — overview of your multisig accounts.
- **Create Multisig** — set up a new multisig.
- **New Transaction / Transaction Detail** — propose and follow a transaction's signing progress.
- **Settings** — manage configuration.

## Tech

React · TypeScript · Vite · Tailwind · shadcn/ui · [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk) · [@stellar/freighter-api](https://www.freighter.app/)

## Run locally

```bash
npm install
npm run dev
```
