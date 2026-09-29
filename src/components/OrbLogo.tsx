interface OrbLogoProps {
  size?: number;
}

export function OrbLogo({ size = 28 }: OrbLogoProps) {
  return (
    <img
      src="/orblogo.png"
      width={size}
      height={size}
      alt="Ouroboros logo"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
