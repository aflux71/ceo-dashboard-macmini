import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Upload, FileText, Sparkles } from "lucide-react";
import AIChat from "@/components/ai/AIChat";
import FileEnrichment from "@/components/ai/FileEnrichment";
import ReportGenerator from "@/components/ai/ReportGenerator";

export default function AIAssistant() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">AI Assistant</h1>
          <p className="text-sm text-zinc-500">Ask questions, enrich files, and generate reports</p>
        </div>
      </div>

      <Tabs defaultValue="chat">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="chat" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <MessageSquare className="w-3.5 h-3.5" /> Ask AI
          </TabsTrigger>
          <TabsTrigger value="enrich" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <Upload className="w-3.5 h-3.5" /> File Enrichment
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
            <FileText className="w-3.5 h-3.5" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <AIChat />
        </TabsContent>
        <TabsContent value="enrich" className="mt-4">
          <FileEnrichment />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}