export type SettingsSectionId =
  | "appearance"
  | "analytics"
  | "backup"
  | "development"
  | "shortcuts";

export interface SettingsSectionDefinition {
  group: "Preferences" | "Workspace";
  icon: string;
  id: SettingsSectionId;
  label: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    id: "appearance",
    label: "Appearance",
    group: "Preferences",
    icon: "palette",
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Preferences",
    icon: "keyboard",
  },
  {
    id: "analytics",
    label: "Analytics",
    group: "Workspace",
    icon: "chart",
  },
  {
    id: "backup",
    label: "Backup",
    group: "Workspace",
    icon: "archive",
  },
  {
    id: "development",
    label: "Development",
    group: "Workspace",
    icon: "code",
  },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "appearance";

export function settingsSectionsForNav(options: {
  showDevelopment: boolean;
}): SettingsSectionDefinition[] {
  return SETTINGS_SECTIONS.filter(
    (section) => section.id !== "development" || options.showDevelopment
  );
}

const SETTINGS_SECTION_IDS = new Set<SettingsSectionId>(
  SETTINGS_SECTIONS.map((section) => section.id)
);

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_IDS.has(value as SettingsSectionId);
}

export function getSettingsSection(
  id: SettingsSectionId
): SettingsSectionDefinition {
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
  if (!section) {
    throw new Error(`Unknown settings section: ${id}`);
  }
  return section;
}
