import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface FileUploadProps {
  onLoad: (source: string, filename: string) => void;
}

// Bundled at build time, so the samples work with no server or upload.
const SAMPLE_FILES = import.meta.glob<string>("../samples/*.snek", { query: "?raw", import: "default", eager: true });
const SAMPLES = Object.entries(SAMPLE_FILES)
  .map(([path, text]) => ({ name: path.slice(path.lastIndexOf("/") + 1), text }))
  // demo first (the curated walkthrough), then the error samples A–Z
  .sort((a, b) => (a.name === "demo.snek" ? -1 : b.name === "demo.snek" ? 1 : a.name.localeCompare(b.name)));

const controlStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 14px",
  lineHeight: 1,
  background: colors.uploadBg,
  borderRadius: 8,
  color: colors.textPrimary,
  fontFamily: fonts.base,
  fontSize: 13,
  cursor: "pointer",
} as const;

export function FileUpload({ onLoad }: FileUploadProps) {
  const handleChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
    input.value = ""; // allow re-uploading the same file after editing it on disk
  };

  const handleSample = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const sample = SAMPLES.find((s) => s.name === select.value);
    if (sample) onLoad(sample.text, sample.name);
    select.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value=""
        onChange={handleSample}
        title="Load a bundled sample program"
        style={{ ...controlStyle, border: `1px solid ${colors.uploadBorder}`, appearance: "auto" }}
      >
        <option value="" disabled>Load sample…</option>
        {SAMPLES.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>
      <label style={{ ...controlStyle, border: `1px dashed ${colors.uploadBorder}` }}>
        <span>Upload .snek file</span>
        <input type="file" accept=".snek" onChange={handleChange} style={{ display: "none" }} />
      </label>
    </div>
  );
}
