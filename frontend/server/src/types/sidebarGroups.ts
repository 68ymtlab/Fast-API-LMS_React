export type SidebarGroups = {
  groupLabel: string | undefined;
  groupItems: {
    title: string;
    url?: string;
    externalUrl?: string;
    icon: React.ElementType;
    newTab?: boolean;
  }[];
};
