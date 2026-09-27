import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

interface TabBarProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

export function TabBar<T extends string>({ tabs, value, onChange }: TabBarProps<T>) {
  return (
    <div style={{ display: "flex", gap: 2, padding: 3, background: colors.panelBackground, border: `1px solid ${colors.border}`, borderRadius: 6 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            border: "none",
            borderRadius: 4,
            padding: "2px 9px",
            cursor: "pointer",
            fontFamily: fonts.base,
            fontSize: 11,
            background: t.id === value ? colors.nodeIdle : "transparent",
            color: t.id === value ? colors.textPrimary : colors.textSecondary,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
