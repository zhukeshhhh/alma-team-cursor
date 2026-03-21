import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the page.tsx file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
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
