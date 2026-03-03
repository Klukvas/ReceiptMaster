import type { ReactNode } from "react";
import {
  Tabs as BaseTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@klukvas/flux-b2c-ui";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const Tabs = ({ tabs, activeTab, onTabChange }: TabsProps) => (
  <BaseTabs value={activeTab} onValueChange={onTabChange}>
    <TabsList>
      {tabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {tabs.map((tab) => (
      <TabsContent key={tab.id} value={tab.id}>
        {tab.content}
      </TabsContent>
    ))}
  </BaseTabs>
);
