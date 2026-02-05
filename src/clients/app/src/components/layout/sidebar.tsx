import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Plus, MessageSquare, Users, Hash, Settings, Search, Bot, RotateCcw, Archive, Calendar, ChevronDown, Loader2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AppState } from "../types/app-state";
import { useStreamingConversations } from "../../core/streaming/use-streaming";

interface SidebarProps {
  state: AppState;
  activeConversationIds: Set<string>;
  onAction: (action: string, data: any) => void;
}

function ConversationItem({ 
  conversation, 
  isActive, 
  isStreaming,
  onSelect, 
  onRestore,
  onArchive
}: { 
  conversation: AppState["conversations"][0]; 
  isActive: boolean;
  isStreaming: boolean;
  onSelect: () => void;
  onRestore?: () => void;
  onArchive?: () => void;
}) {
  const getIcon = () => {
    switch (conversation.type) {
      case "main":
        return <MessageSquare />;
      case "group":
        return <Users />;
      case "channel":
        return <Hash />;
      default:
        return <MessageSquare />;
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onSelect}
        isActive={isActive}
        tooltip={conversation.label || conversation.id}
      >
        {getIcon()}
        <span className="flex-1 min-w-0 truncate">{conversation.label || conversation.id}</span>
        {isStreaming && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        )}
      </SidebarMenuButton>
      {(onRestore || onArchive) && (
        <div
          data-sidebar="menu-action"
          className="absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0 after:absolute after:-inset-2 after:md:hidden peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0"
        >
          {onRestore && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              title="Restore"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {onArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title="Archive"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar({ state, activeConversationIds, onAction }: SidebarProps) {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const streamingConversations = useStreamingConversations();
  
  // Determine current page type
  const currentPage = location.pathname.startsWith("/agent/") 
    ? "agent" 
    : location.pathname === "/settings"
    ? "settings"
    : location.pathname === "/inspector"
    ? "inspector"
    : location.pathname === "/calendar"
    ? "calendar"
    : "home";

  // Filter conversations based on search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return state.conversations;
    const query = searchQuery.toLowerCase();
    return state.conversations.filter(
      (conversation) =>
        conversation.label?.toLowerCase().includes(query) ||
        conversation.id.toLowerCase().includes(query)
    );
  }, [state.conversations, searchQuery]);

  // Group conversations into Active and Archived, sorted by lastActivity (most recent first)
  const activeConversations = useMemo(() => {
    return filteredConversations
      .filter((s) => activeConversationIds.has(s.id))
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [filteredConversations, activeConversationIds]);

  const archivedConversations = useMemo(() => {
    return filteredConversations
      .filter((s) => !activeConversationIds.has(s.id))
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [filteredConversations, activeConversationIds]);

  // Count conversations per agent
  const agentConversationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    state.conversations.forEach((conversation) => {
      if (conversation.agentId) {
        counts[conversation.agentId] = (counts[conversation.agentId] || 0) + 1;
      }
    });
    return counts;
  }, [state.conversations]);

  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return state.agents;
    const query = searchQuery.toLowerCase();
    return state.agents.filter((agentId) => agentId.toLowerCase().includes(query));
  }, [state.agents, searchQuery]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="relative">
          <Search 
            className="absolute h-4 w-4 text-muted-foreground pointer-events-none z-10" 
            style={{ 
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
            }} 
          />
          <SidebarInput
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Calendar */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onAction("show-calendar", {})}
                isActive={currentPage === "calendar"}
                tooltip="Calendar"
              >
                <Calendar />
                <span>Calendar</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Active Conversations */}
        <SidebarGroup>
          <SidebarGroupLabel>
            Active
            {activeConversations.length > 0 && (
              <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{activeConversations.length}</span>
            )}
          </SidebarGroupLabel>
          {activeConversations.length > 0 && (
            <SidebarGroupAction
              onClick={(e) => {
                e.stopPropagation();
                onAction("new-conversation", {});
              }}
              title="New conversation"
            >
              <Plus />
              <span className="sr-only">New conversation</span>
            </SidebarGroupAction>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {activeConversations.length === 0 ? (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {state.conversations.length === 0 && !searchQuery 
                      ? "No conversations yet"
                      : searchQuery 
                      ? "No matching active conversations" 
                      : "No active conversations"}
                  </div>
                </SidebarMenuItem>
              ) : (
                activeConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={currentPage === "home" && conversation.id === state.currentConversationId}
                    isStreaming={streamingConversations.has(conversation.id)}
                    onSelect={() => onAction("select-conversation", { conversationId: conversation.id })}
                    onArchive={() => onAction("archive-conversation", { conversationId: conversation.id })}
                  />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Archived Conversations */}
        <Collapsible defaultOpen={false} className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="w-full">
                Archived
                {archivedConversations.length > 0 && (
                  <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{archivedConversations.length}</span>
                )}
                <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {archivedConversations.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {searchQuery ? "No matching conversations" : "No archived conversations"}
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    archivedConversations.map((conversation) => (
                      <ConversationItem
                        key={conversation.id}
                        conversation={conversation}
                        isActive={false}
                        isStreaming={streamingConversations.has(conversation.id)}
                        onSelect={() => {
                          // Don't immediately select archived conversations - require restore button
                        }}
                        onRestore={() => onAction("restore-conversation", { conversationId: conversation.id })}
                      />
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator />

        {/* Agents Section */}
        <Collapsible defaultOpen={true} className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="w-full">
                Agents
                {filteredAgents.length > 0 && (
                  <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{filteredAgents.length}</span>
                )}
                <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAgents.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {searchQuery ? "No matching agents" : "No agents available"}
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    filteredAgents.map((agentId) => {
                      const conversationCount = agentConversationCounts[agentId] || 0;
                      const isActive = currentPage === "agent" && agentId === state.currentAgentId;
                      return (
                        <SidebarMenuItem key={agentId}>
                          <SidebarMenuButton
                            onClick={() => onAction("select-agent", { agentId })}
                            isActive={isActive}
                            tooltip={agentId}
                          >
                            <Bot />
                            <span>{agentId}</span>
                            {conversationCount > 0 && (
                              <SidebarMenuBadge className="ml-auto">{conversationCount}</SidebarMenuBadge>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator />

        {/* Settings */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onAction("show-settings", {})}
                isActive={currentPage === "settings"}
                tooltip="Settings"
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
