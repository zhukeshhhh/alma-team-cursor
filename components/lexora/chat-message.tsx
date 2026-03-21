"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Message } from "@/app/page";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  if (!message.content.trim()) {
    return (
      <div className="flex justify-start">
        <div className="text-muted-foreground text-sm animate-pulse">Thinking…</div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="rounded-lg border-l-2 border-primary bg-card px-4 py-3 shadow-sm">
          <div className="prose prose-sm max-w-none text-card-foreground">
            {message.content.split("\n\n").map((paragraph, i) => (
              <p key={i} className="mb-3 last:mb-0">
                {paragraph.split("\n").map((line, j) => (
                  <span key={j}>
                    {formatLine(line)}
                    {j < paragraph.split("\n").length - 1 && <br />}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>

        {message.sources && message.sources.length > 0 && (
          <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
            <CollapsibleTrigger className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  sourcesOpen && "rotate-180"
                )}
              />
              {message.sources.length} Source{message.sources.length !== 1 && "s"}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5">
                {message.sources.map((source, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {source.title}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{source.page}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

function formatLine(line: string): React.ReactNode {
  // Handle bold text with **
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Handle list items
    if (part.startsWith("- ")) {
      return (
        <span key={i} className="ml-2">
          • {part.slice(2)}
        </span>
      );
    }
    return part;
  });
}
