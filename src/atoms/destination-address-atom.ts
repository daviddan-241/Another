import { atom } from 'jotai';

export const PAYMENT_ETH_ADDRESS = '0x479F8bdD340bD7276D6c7c9B3fF86EF2315f857A';
export const PAYMENT_SOL_ADDRESS = '46ZKRuURaASKEcKBafnPZgMaTqBL8RK8TssZgZzFCBzn';

export const destinationAddressAtom = atom<string>(PAYMENT_ETH_ADDRESS);
export const solanaDestinationAtom = atom<string>(PAYMENT_SOL_ADDRESS);
