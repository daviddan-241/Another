type Props = {
  href?: string;
  label?: string;
};

export const MintButton = ({
  href = 'https://dexscreener.com/solana/j1wpmugrooj1ymyqkrdz2vwrxg5rhfx3vtnye39gpump',
  label = 'Buy WOULD on DEX',
}: Props) => {
  return (
    <a className="primary-action" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
};
