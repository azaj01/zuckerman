import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Users, Hash, Settings, ChevronDown, ChevronRight, Search, Bot, RotateCcw, Archive, Calendar } from "lucide-react";
import type { AppState } from "../types/app-state";

interface SidebarProps {
  state: AppState;
  activeConversationIds: Set<string>;
  onAction: (action: string, data: any) => void;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  alwaysExpanded?: boolean;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultExpanded = true, alwaysExpanded = false, actionButton, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (alwaysExpanded) return true;
    return defaultExpanded;
  });

  const toggle = () => {
    if (alwaysExpanded) return;
    setIsExpanded(!isExpanded);
  };

  // Force expanded state if alwaysExpanded is true
  const expanded = alwaysExpanded ? true : isExpanded;

  return (
    <div>
      <div
        onClick={toggle}
        role="button"
        tabIndex={alwaysExpanded ? -1 : 0}
        onKeyDown={(e) => {
          if (!alwaysExpanded && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggle();
          }
        }}
        className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors rounded-md group ${
          alwaysExpanded ? 'cursor-default' : 'hover:bg-accent/50 cursor-pointer'
        }`}
        style={{ backgroundColor: 'transparent' }}
      >
        <div className="flex items-center gap-1.5 flex-1">
          {!alwaysExpanded && (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            )
          )}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal bg-muted/50 text-muted-foreground border-0">
              {count}
            </Badge>
          )}
        </div>
        {actionButton && (
          <div onClick={(e) => e.stopPropagation()}>
            {actionButton}
          </div>
        )}
      </div>
      {expanded && (
        <div className="mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function ConversationItem({ 
  conversation, 
  isActive, 
  onSelect, 
  onRestore,
  onArchive
}: { 
  conversation: AppState["conversations"][0]; 
  isActive: boolean; 
  onSelect: () => void;
  onRestore?: () => void;
  onArchive?: () => void;
}) {
  const getIcon = () => {
    switch (conversation.type) {
      case "main":
        return <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "group":
        return <Users className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "channel":
        return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
      default:
        return <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  return (
    <div className="group/item relative">
      <button
        onClick={onSelect}
        className={`
          w-full px-3 py-1.5 text-sm text-left
          transition-all duration-150
          flex items-center gap-2 group relative
          ${
            isActive
              ? "text-foreground font-medium"
              : "text-foreground/70 hover:text-foreground"
          }
        `}
        style={{
          backgroundColor: isActive ? 'hsl(var(--accent))' : 'transparent',
          borderRadius: '6px',
        }}
      >
        {/* GitHub-style left border indicator for active item */}
        {isActive && (
          <div 
            className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getIcon()}
          <span className="truncate flex-1">{conversation.label || conversation.id}</span>
        </div>
        {/* Subtle hover background */}
        <div 
          className={`absolute inset-0 rounded-md transition-opacity duration-150 ${
            isActive ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ backgroundColor: 'hsl(var(--accent))', zIndex: -1 }}
        />
      </button>
      {/* Action buttons */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1">
        {onRestore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
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
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ state, activeConversationIds, onAction }: SidebarProps) {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
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
    <div 
      className="w-[240px] shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden"
      style={{ backgroundColor: 'hsl(var(--sidebar-background))' }}
    >
      {/* Quick Actions Bar - GitHub style */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="relative">
          <Search 
            className="absolute h-4 w-4 text-muted-foreground pointer-events-none z-10" 
            style={{ 
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              lineHeight: '1'
            }} 
          />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pr-3 text-[13px] bg-background border-border focus-visible:border-primary transition-colors w-full"
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2 px-1 space-y-1">
          {/* Calendar */}
          <div className="px-3 pb-2">
            <Button
              variant="ghost"
              size="sm"
              className={`w-full h-8 text-sm font-normal justify-start px-3 transition-colors relative ${
                currentPage === "calendar"
                  ? "text-foreground font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
              }`}
              style={{
                backgroundColor: currentPage === "calendar" ? 'hsl(var(--accent))' : 'transparent',
              }}
              onClick={() => onAction("show-calendar", {})}
            >
              {currentPage === "calendar" && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                />
              )}
              <Calendar className="h-4 w-4 mr-2" />
              Calendar
            </Button>
          </div>

          <Separator className="my-2" />

          {/* Active Conversations */}
          <CollapsibleSection
            title="Active"
            count={activeConversations.length}
            defaultExpanded={true}
            alwaysExpanded={activeConversations.length > 0}
            actionButton={
              <button
                onClick={() => onAction("new-conversation", {})}
                className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="New conversation"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          >
            <div className="px-2 space-y-0.5">
              {activeConversations.length === 0 ? (
                state.conversations.length === 0 && !searchQuery ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground/70">
                    No conversations yet
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground/70">
                    {searchQuery ? "No matching active conversations" : "No active conversations"}
                  </div>
                )
              ) : (
                activeConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={currentPage === "home" && conversation.id === state.currentConversationId}
                    onSelect={() => onAction("select-conversation", { conversationId: conversation.id })}
                    onArchive={() => onAction("archive-conversation", { conversationId: conversation.id })}
                  />
                ))
              )}
            </div>
          </CollapsibleSection>

          {/* Archived Conversations */}
          <CollapsibleSection
            title="Archived"
            count={archivedConversations.length}
            defaultExpanded={false}
          >
            <div className="px-2 space-y-0.5">
              {archivedConversations.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/70">
                  {searchQuery ? "No matching conversations" : "No archived conversations"}
                </div>
              ) : (
                archivedConversations.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isActive={false}
                    onSelect={() => {
                      // Don't immediately select archived conversations - require restore button
                    }}
                    onRestore={() => onAction("restore-conversation", { conversationId: conversation.id })}
                  />
                ))
              )}
            </div>
          </CollapsibleSection>

          <Separator className="my-2" />

          {/* Agents Section */}
          <CollapsibleSection
            title="Agents"
            count={filteredAgents.length}
            defaultExpanded={true}
          >
            <div className="px-2 space-y-0.5">
              {filteredAgents.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/70">
                  {searchQuery ? "No matching agents" : "No agents available"}
                </div>
              ) : (
                filteredAgents.map((agentId) => {
                  const conversationCount = agentConversationCounts[agentId] || 0;
                  const isActive = currentPage === "agent" && agentId === state.currentAgentId;
                  return (
                    <button
                      key={agentId}
                      onClick={() => onAction("select-agent", { agentId })}
                      className={`
                        w-full px-3 py-1.5 text-sm text-left
                        transition-all duration-150
                        flex items-center gap-2 group relative
                        ${
                          isActive
                            ? "text-foreground font-medium"
                            : "text-foreground/70 hover:text-foreground"
                        }
                      `}
                      style={{
                        backgroundColor: isActive ? 'hsl(var(--accent))' : 'transparent',
                        borderRadius: '6px',
                      }}
                    >
                      {/* GitHub-style left border indicator for active item */}
                      {isActive && (
                        <div 
                          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                          style={{ backgroundColor: 'hsl(var(--primary))' }}
                        />
                      )}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{agentId}</span>
                        {conversationCount > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal bg-muted/50 text-muted-foreground border-0 shrink-0">
                            {conversationCount}
                          </Badge>
                        )}
                      </div>
                      {/* Subtle hover background */}
                      <div 
                        className={`absolute inset-0 rounded-md transition-opacity duration-150 ${
                          isActive ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        style={{ backgroundColor: 'hsl(var(--accent))', zIndex: -1 }}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </CollapsibleSection>

          <Separator className="my-2" />

          {/* Settings Section - GitHub style */}
          <div className="px-3 space-y-0.5 pt-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
              className={`w-full h-8 text-sm font-normal justify-start px-3 transition-colors relative ${
                currentPage === "settings"
                  ? "text-foreground font-medium"
                  : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
              }`}
              style={{
                backgroundColor: currentPage === "settings" ? 'hsl(var(--accent))' : 'transparent',
              }}
              onClick={() => onAction("show-settings", {})}
            >
              {currentPage === "settings" && (
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                    style={{ backgroundColor: 'hsl(var(--primary))' }}
                  />
                )}
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
