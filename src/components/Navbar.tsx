import { FileUpload } from "./FileUpload";
import { SnekLogo } from "./SnekLogo";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface NavbarProps {
  filename: string | null;
  tokenCount: number;
  onLoad: (source: string, filename: string) => void;
}

export function Navbar({ filename, tokenCount, onLoad }: NavbarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 20px",
        borderRadius: 16,
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: "blur(14px)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SnekLogo size={38} />
        <span style={{ fontFamily: fonts.mono, fontSize: 20, letterSpacing: 0.5, color: colors.textPrimary, fontWeight: 700 }}>
          Snek
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {filename && (
          <span style={{ fontFamily: fonts.base, fontSize: 12, color: colors.textSecondary }}>
            {filename} - {tokenCount} tokens
          </span>
        )}
        <FileUpload onLoad={onLoad} />
      </div>
    </div>
  );
}
