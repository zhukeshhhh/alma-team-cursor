"use client";

import { useRef } from "react";
import { Shield, Upload, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Document } from "@/app/page";

interface SidebarProps {
  documents: Document[];
  activeDocumentId: string;
  onSelectDocument: (id: string) => void;
  onUploadFiles?: (files: FileList) => void;
}

const typeColors: Record<Document["type"], string> = {
  PDF: "bg-red-500/20 text-red-400",
  DOCX: "bg-blue-500/20 text-blue-400",
  XLSX: "bg-emerald-500/20 text-emerald-400",
};

export function Sidebar({
  documents,
  activeDocumentId,
  onSelectDocument,
  onUploadFiles,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside
      className="flex h-full w-[280px] shrink-0 flex-col"
      style={{ backgroundColor: "#0F1117" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
          <Shield className="h-4.5 w-4.5 text-white" />
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">
          Lexora
        </span>
      </div>

      {/* Upload — hidden input opens the system file picker */}
      <div className="px-4 py-4">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) onUploadFiles?.(list);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          className="w-full justify-center gap-2 bg-sidebar-primary text-white hover:bg-sidebar-primary/90"
          size="default"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Document List */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 pb-4">
          {documents.map((doc) => (
            <DocumentItem
              key={doc.id}
              document={doc}
              isActive={doc.id === activeDocumentId}
              onClick={() => onSelectDocument(doc.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}

interface DocumentItemProps {
  document: Document;
  isActive: boolean;
  onClick: () => void;
}

function DocumentItem({ document, isActive, onClick }: DocumentItemProps) {
  const Icon = document.type === "XLSX" ? FileSpreadsheet : FileText;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        isActive
          ? "border border-sidebar-primary/50 bg-sidebar-accent"
          : "border border-transparent hover:bg-white/5"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isActive ? "text-white" : "text-gray-300"
            )}
          >
            {document.name}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              typeColors[document.type]
            )}
          >
            {document.type}
          </span>
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 rounded-full",
              document.status === "ready" ? "bg-emerald-500" : "bg-gray-500"
            )}
          />
          <span className="text-xs text-sidebar-muted">{document.timestamp}</span>
        </div>
      </div>
    </button>
  );
}
