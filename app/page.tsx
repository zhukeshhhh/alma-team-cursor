"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sidebar } from "@/components/lexora/sidebar";
import { ChatArea } from "@/components/lexora/chat-area";

export interface Document {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "XLSX";
  status: "processing" | "ready";
  timestamp: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; page: string }[];
}

type ConvexDocument = {
  _id: string;
  _creationTime: number;
  name: string;
  fileType: string;
  sizeBytes: number;
  userId: string;
  status: "processing" | "ready";
};

function inferDocType(name: string, fileType: string): Document["type"] {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || fileType === "application/pdf") return "PDF";
  if (
    n.endsWith(".docx") ||
    fileType.includes("wordprocessingml") ||
    fileType === "application/msword"
  ) {
    return "DOCX";
  }
  if (
    n.endsWith(".xlsx") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("excel")
  ) {
    return "XLSX";
  }
  return "PDF";
}

function convexDocToDocument(doc: ConvexDocument): Document {
  return {
    id: doc._id,
    name: doc.name,
    type: inferDocType(doc.name, doc.fileType),
    status: doc.status,
    timestamp: formatDistanceToNow(doc._creationTime, { addSuffix: true }),
  };
}

const dummyMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content:
      "What are the key termination clauses in this merger agreement?",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Based on my analysis of the Corporate Merger Agreement, there are three primary termination clauses:\n\n1. **Material Adverse Change (MAC) Clause** - Either party may terminate if a material adverse change occurs affecting the target company's business, financial condition, or operations.\n\n2. **Regulatory Approval Failure** - The agreement allows termination if required regulatory approvals are not obtained within 180 days of signing.\n\n3. **Breach of Representations** - Termination is permitted if either party materially breaches representations and warranties, subject to a 30-day cure period.",
    sources: [
      { title: "Section 8.1 - Termination Rights", page: "Page 45" },
      { title: "Section 8.2 - MAC Definition", page: "Page 47" },
      { title: "Schedule A - Regulatory Requirements", page: "Page 89" },
    ],
  },
  {
    id: "3",
    role: "user",
    content: "Are there any potential liability risks I should be aware of?",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "I've identified several potential liability risks in this agreement:\n\n**High Risk:**\n- The indemnification cap is set at 150% of the purchase price, which exceeds industry standard (typically 100%).\n- Environmental liability carve-outs are notably absent.\n\n**Medium Risk:**\n- Survival period for representations extends 36 months post-closing.\n- Basket threshold for claims is relatively low at $250,000.\n\n**Recommendations:**\nConsider negotiating the indemnification cap downward and adding specific environmental liability protections before execution.",
    sources: [
      { title: "Section 9.3 - Indemnification Limits", page: "Page 52" },
      { title: "Section 7.2 - Environmental Matters", page: "Page 38" },
    ],
  },
];

export default function LexoraPage() {
  const rawDocuments = useQuery(api.documents.listDocuments, {
    userId: "demo-user",
  });
  const createDocument = useMutation(api.documents.createDocument);

  const documents = useMemo((): Document[] => {
    const rows = (rawDocuments ?? []) as ConvexDocument[];
    return rows.map(convexDocToDocument);
  }, [rawDocuments]);

  const [activeDocumentId, setActiveDocumentId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>(dummyMessages);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (documents.length === 0) {
      setActiveDocumentId("");
      return;
    }
    setActiveDocumentId((prev) =>
      prev && documents.some((d) => d.id === prev) ? prev : documents[0].id
    );
  }, [documents]);

  const activeDocument = documents.find((doc) => doc.id === activeDocumentId);

  const handleUpload = async (file: File) => {
    await createDocument({
      name: file.name,
      fileType: file.type,
      sizeBytes: file.size,
      userId: "demo-user",
    });
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
    };

    setMessages([...messages, newMessage]);
    setInputValue("");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        documents={documents}
        activeDocumentId={activeDocumentId}
        onSelectDocument={setActiveDocumentId}
        onUploadFile={handleUpload}
      />
      <ChatArea
        activeDocument={activeDocument}
        messages={messages}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
