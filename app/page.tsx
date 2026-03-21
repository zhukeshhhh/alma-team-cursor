"use client";

import { useState } from "react";
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

const dummyDocuments: Document[] = [
  {
    id: "1",
    name: "Corporate_Merger_Agreement_2024.pdf",
    type: "PDF",
    status: "ready",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    name: "Regulatory_Compliance_Report.docx",
    type: "DOCX",
    status: "ready",
    timestamp: "5 hours ago",
  },
  {
    id: "3",
    name: "Financial_Audit_Q4.xlsx",
    type: "XLSX",
    status: "processing",
    timestamp: "12 hours ago",
  },
  {
    id: "4",
    name: "Employment_Contract_Template.pdf",
    type: "PDF",
    status: "ready",
    timestamp: "1 day ago",
  },
  {
    id: "5",
    name: "Risk_Assessment_Matrix.xlsx",
    type: "XLSX",
    status: "ready",
    timestamp: "3 days ago",
  },
];

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
  const [documents] = useState<Document[]>(dummyDocuments);
  const [activeDocumentId, setActiveDocumentId] = useState<string>("1");
  const [messages, setMessages] = useState<Message[]>(dummyMessages);
  const [inputValue, setInputValue] = useState("");

  const activeDocument = documents.find((doc) => doc.id === activeDocumentId);

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
