interface SnekLogoProps {
  size?: number;
}

export function SnekLogo({ size = 28 }: SnekLogoProps) {
  return (
    <img
      src="/sneklogo.png"
      width={size}
      height={size}
      alt="Ouroboros logo"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
