import { FileUpload } from "./FileUpload";
import { OrbLogo } from "./OrbLogo";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import { PHONE, useMedia } from "../hooks/useMedia";

interface NavbarProps {
  filename: string | null;
  tokenCount: number;
  onLoad: (source: string, filename: string) => void;
}

export function Navbar({ filename, tokenCount, onLoad }: NavbarProps) {
  const phone = useMedia(PHONE);
  return (
    <div
      style={{
        position: "absolute",
        top: phone ? 8 : 16,
        left: phone ? 8 : 16,
        right: phone ? 8 : 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: phone ? 8 : 16,
        padding: phone ? "6px 10px" : "10px 20px",
        borderRadius: phone ? 12 : 16,
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        backdropFilter: "blur(14px)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: phone ? 8 : 12, flexShrink: 0 }}>
        <OrbLogo size={phone ? 28 : 38} />
        <span style={{ fontFamily: fonts.mono, fontSize: phone ? 16 : 20, letterSpacing: 0.5, color: colors.textPrimary, fontWeight: 700 }}>
          Ouroboros
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {filename && !phone && (
          <span style={{ fontFamily: fonts.base, fontSize: 12, color: colors.textSecondary }}>
            {filename} - {tokenCount} tokens
          </span>
        )}
        <FileUpload onLoad={onLoad} compact={phone} />
      </div>
    </div>
  );
}
