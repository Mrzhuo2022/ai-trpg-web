export function escapeRegex(input: string): string;
export const KNOWN_SECTION_LABELS: readonly string[];
export function compactInline(text: string): string;
export function normalizeAssistantLayout(rawText: string): string;
export function extractSectionByLabels(text: string, labels: readonly string[]): string;
export function isEndingText(text: string): boolean;
export function isLikelyActionOption(option: string): boolean;
export function sanitizeOption(option: string): string;
export function extractActionOptionsFromLines(lines: string[]): string[];
