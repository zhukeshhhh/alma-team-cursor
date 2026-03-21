"use client";

import { Shield, Upload, FileText, FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Document } from "@/app/page";

interface SidebarProps {
  documents: Document[];
  activeDocumentId: string;
  onSelectDocument: (id: string) => void;
  onUploadFiles?: (files: FileList) => void | Promise<void>;
  uploading?: boolean;
  documentsLoading?: boolean;
}

const typeColors: Record<Document["type"], string> = {
  PDF: "bg-red-500/20 text-red-400",
  DOCX: "bg-blue-500/20 text-blue-400",
  XLSX: "bg-emerald-500/20 text-emerald-400",
  TXT: "bg-violet-500/20 text-violet-400",
};

const statusDotClass: Record<Document["status"], string> = {
  uploading: "bg-gray-400",
  processing: "bg-yellow-400 animate-pulse",
  ready: "bg-emerald-500",
  error: "bg-red-500",
};

export function Sidebar({
  documents,
  activeDocumentId,
  onSelectDocument,
  onUploadFiles,
  uploading = false,
  documentsLoading = false,
}: SidebarProps) {
  return (
    <aside
      className="flex h-full min-h-0 w-[280px] shrink-0 flex-col"
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

      {/* Upload — label + hidden input opens the picker without programmatic click (more reliable than ref.click on sr-only inputs) */}
      <div className="px-4 py-4">
        <label
          className={cn(
            buttonVariants({ variant: "default", size: "default" }),
            "w-full cursor-pointer justify-center gap-2 bg-sidebar-primary text-white hover:bg-sidebar-primary/90",
            uploading && "pointer-events-none cursor-not-allowed opacity-50"
          )}
        >
          <input
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            multiple
            disabled={uploading}
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length) void onUploadFiles?.(list);
              e.target.value = "";
            }}
          />
          <Upload className="h-4 w-4" />
          {uploading ? "Processing…" : "Upload Document"}
        </label>
      </div>

      {/* Document List */}
      <ScrollArea className="flex-1 min-h-0 px-3">
        <div className="space-y-1 pb-4">
          {documentsLoading && (
            <p className="px-3 py-2 text-sm text-sidebar-muted">Loading documents…</p>
          )}
          {!documentsLoading && documents.length === 0 && (
            <p className="px-3 py-2 text-sm text-sidebar-muted">
              No documents yet. Upload a PDF, DOCX, or TXT file.
            </p>
          )}
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
              statusDotClass[document.status]
            )}
          />
          <span className="text-xs text-sidebar-muted">{document.timestamp}</span>
        </div>
      </div>
    </button>
  );
}
