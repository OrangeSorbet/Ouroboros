import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface FileUploadProps {
  onLoad: (source: string, filename: string) => void;
}

export function FileUpload({ onLoad }: FileUploadProps) {
  const handleChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
  };

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        lineHeight: 1,
        background: colors.uploadBg,
        border: `1px dashed ${colors.uploadBorder}`,
        borderRadius: 8,
        color: colors.textPrimary,
        fontFamily: fonts.base,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <span>Upload .snek file</span>
      <input type="file" accept=".snek" onChange={handleChange} style={{ display: "none" }} />
    </label>
  );
}
