"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Sidebar } from "@/components/lexora/sidebar";
import { ChatArea } from "@/components/lexora/chat-area";

const DEMO_USER_ID = "demo-user";

export type DocumentStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export interface Document {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX" | "TXT";
  status: DocumentStatus;
  timestamp: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; page: string }[];
}

function formatUploadedAt(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fileTypeFromMime(fileType: string, name: string): Document["type"] {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".docx")) return "DOCX";
  if (n.endsWith(".txt")) return "TXT";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "XLSX";
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "XLSX";
  if (fileType.includes("word")) return "DOCX";
  if (fileType.startsWith("text/")) return "TXT";
  return "PDF";
}

function mapConvexDoc(doc: Doc<"documents">): Document {
  return {
    id: doc._id,
    name: doc.name,
    type: fileTypeFromMime(doc.fileType, doc.name),
    status: doc.status,
    timestamp: formatUploadedAt(doc.uploadedAt),
  };
}

export default function LexoraPage() {
  const createDocument = useMutation(api.documents.createDocument);
  const convexDocs = useQuery(api.documents.listDocuments, {
    userId: DEMO_USER_ID,
  });

  const documents: Document[] = useMemo(
    () => (convexDocs ?? []).map(mapConvexDoc),
    [convexDocs]
  );

  const [activeDocumentId, setActiveDocumentId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    if (documents.length === 0) return;
    setActiveDocumentId((prev) => {
      if (prev && documents.some((d) => d.id === prev)) return prev;
      return documents[0].id;
    });
  }, [documents]);

  const activeDocument = documents.find((doc) => doc.id === activeDocumentId);

  useEffect(() => {
    setChatId(null);
    setMessages([]);
  }, [activeDocumentId]);

  const handleUploadFiles = useCallback(
    async (files: FileList) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      setUploading(true);
      try {
        for (const file of list) {
          const documentId = await createDocument({
            name: file.name,
            fileType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            userId: DEMO_USER_ID,
          });

          const formData = new FormData();
          formData.append("file", file);
          formData.append("documentId", documentId);

          const res = await fetch("/api/ingest", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("Ingestion failed:", err);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [createDocument]
  );

  const handleSendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || !activeDocumentId || streaming) return;
    if (activeDocument?.status !== "ready") return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantId = crypto.randomUUID();
    setInputValue("");
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          documentId: activeDocumentId,
          chatId,
        }),
      });

      const headerChatId = res.headers.get("X-Chat-Id");
      if (headerChatId) setChatId(headerChatId);

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({})) as {
          error?: string;
        };
        const msg = errBody.error ?? res.statusText;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: `Sorry — ${msg}`,
            };
          }
          return next;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
          }
          return next;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: "Something went wrong. Try again.",
          };
        }
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [
    inputValue,
    activeDocumentId,
    activeDocument?.status,
    streaming,
    chatId,
  ]);

  const chatEnabled =
    Boolean(activeDocumentId) && activeDocument?.status === "ready";

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <Sidebar
        documents={documents}
        activeDocumentId={activeDocumentId}
        onSelectDocument={setActiveDocumentId}
        onUploadFiles={handleUploadFiles}
        uploading={uploading}
        documentsLoading={convexDocs === undefined}
      />
      <ChatArea
        activeDocument={activeDocument}
        messages={messages}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
        uploading={uploading}
        streaming={streaming}
        chatEnabled={chatEnabled}
      />
    </div>
  );
}
