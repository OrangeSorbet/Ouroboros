import { colors } from "../../styles/colors";

// Per-block accent so the IR list and the graph can be matched by eye.
const PALETTE = [colors.typeBadge, colors.accent, colors.warning, colors.nodeActive, colors.codeString, colors.codeKeyword, colors.edgeBack];
export const blockColor = (id: number) => (id >= 0 ? PALETTE[id % PALETTE.length] : colors.textSecondary);
