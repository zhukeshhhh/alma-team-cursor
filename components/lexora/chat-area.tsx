"use client";

import { FileText, AlertTriangle, Send, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import type { Document, Message } from "@/app/page";

interface ChatAreaProps {
  activeDocument?: Document;
  messages: Message[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  uploading?: boolean;
}

export function ChatArea({
  activeDocument,
  messages,
  inputValue,
  onInputChange,
  onSendMessage,
  uploading = false,
}: ChatAreaProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {activeDocument?.name || "No document selected"}
          </span>
          {activeDocument?.status === "uploading" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Uploading
            </span>
          )}
          {activeDocument?.status === "processing" && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              Processing
            </span>
          )}
          {activeDocument?.status === "ready" && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Ready
            </span>
          )}
          {activeDocument?.status === "error" && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
              Error
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Risk Report
        </Button>
      </header>

      {/* Chat Messages — min-h-0 so flex-1 can shrink and the input bar stays in view */}
      <ScrollArea className="min-h-0 flex-1 px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      {/* Input Bar */}
      <div className="shrink-0 border-t border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this document..."
              className="h-11 pr-10 bg-background"
              disabled={uploading}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={onSendMessage}
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!inputValue.trim() || uploading}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
