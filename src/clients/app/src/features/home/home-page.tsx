import React from "react";
import { ChatView } from "./session/chat-view";
import { StatusBar } from "../../components/layout/status-bar";
import type { UseAppReturn } from "../../hooks/use-app";

interface HomePageProps {
  state: UseAppReturn;
  onMainContentAction: (action: string, data: any) => void;
}

export function HomePage({ state, onMainContentAction }: HomePageProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          minHeight: 0,
        }}
      >
        <ChatView state={state} onAction={onMainContentAction} />
      </div>
      <StatusBar state={state} />
    </div>
  );
}
