import { atom } from 'jotai';

export const checkedTokensAtom = atom<
  Record<string, { isChecked: boolean; pendingTxn?: `0x${string}` }>
>({});
